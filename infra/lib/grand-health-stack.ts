import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { AppRuntime } from "./app-runtime";

interface GrandHealthStackProps extends cdk.StackProps {
  stage: string;
}

export class GrandHealthStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: GrandHealthStackProps) {
    super(scope, id, props);

    const { stage } = props;
    const isProd = stage === "prod";

    // ── VPC ──────────────────────────────────────────────────────────────────
    // Single NAT gateway to minimize cost on staging.
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: isProd ? 2 : 1,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: "private", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: "isolated", subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    // ── RDS Postgres ─────────────────────────────────────────────────────────
    // db.t3.micro (~$25/mo) for staging, db.t3.small (~$50/mo) for prod.
    // Multi-AZ only in prod. Encryption at rest always on (HIPAA requirement).
    const dbSecret = new secretsmanager.Secret(this, "DbSecret", {
      secretName: `grand-health-${stage}-db-credentials`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "grandhealth" }),
        generateStringKey: "password",
        excludePunctuation: true,
        passwordLength: 32,
      },
    });

    const dbSg = new ec2.SecurityGroup(this, "DbSg", {
      vpc,
      description: "Grand Health RDS",
      allowAllOutbound: false,
    });

    // Amplify / Lambda will connect from private subnets.
    dbSg.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      "App tier to Postgres"
    );

    const db = new rds.DatabaseInstance(this, "Postgres", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: isProd
        ? ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL)
        : ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSg],
      credentials: rds.Credentials.fromSecret(dbSecret),
      databaseName: "grandhealth",
      multiAz: isProd,
      storageEncrypted: true,         // HIPAA: encryption at rest
      deletionProtection: isProd,
      backupRetention: cdk.Duration.days(isProd ? 14 : 3),
      // Enable enhanced monitoring for HIPAA audit trail
      monitoringInterval: cdk.Duration.seconds(60),
      enablePerformanceInsights: true,
      performanceInsightRetention: rds.PerformanceInsightRetention.DEFAULT,
    });

    // ── Bastion host (SSM-only, no SSH keys) ─────────────────────────────────
    // Used by developers to tunnel to RDS from their laptops via:
    //   aws ssm start-session --target <instance-id> \
    //     --document-name AWS-StartPortForwardingSessionToRemoteHost \
    //     --parameters '{"host":["<rds-endpoint>"],"portNumber":["5432"],"localPortNumber":["5432"]}'
    // Then connect TablePlus to localhost:5432.
    const bastionRole = new iam.Role(this, "BastionRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
      ],
    });

    const bastionSg = new ec2.SecurityGroup(this, "BastionSg", {
      vpc,
      description: "Grand Health bastion - SSM only, no inbound ports needed",
      allowAllOutbound: true,
    });

    const bastion = new ec2.Instance(this, "Bastion", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.NANO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      securityGroup: bastionSg,
      role: bastionRole,
      // No key pair — access only via SSM Session Manager
    });

    // Allow bastion → RDS
    dbSg.addIngressRule(
      bastionSg,
      ec2.Port.tcp(5432),
      "Bastion to Postgres"
    );

    new cdk.CfnOutput(this, "BastionInstanceId", {
      value: bastion.instanceId,
      exportName: `GrandHealth-${stage}-BastionInstanceId`,
      description: "Use with: aws ssm start-session --target <this-id> --document-name AWS-StartPortForwardingSessionToRemoteHost ...",
    });

    // Store connection info in SSM for the app to read.
    new ssm.StringParameter(this, "DbEndpoint", {
      parameterName: `/grand-health/${stage}/db-endpoint`,
      stringValue: db.instanceEndpoint.hostname,
    });

    new ssm.StringParameter(this, "DbPort", {
      parameterName: `/grand-health/${stage}/db-port`,
      stringValue: db.instanceEndpoint.port.toString(),
    });

    // ── Cognito User Pool ─────────────────────────────────────────────────────
    // Password auth + email OTP (magic-link equivalent).
    // MFA optional for patients, required for clinicians (set post-deploy via
    // Admin → Set MFA preference per group).
    const userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: `grand-health-${stage}`,
      selfSignUpEnabled: false,       // Clinicians invite users only
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: false, mutable: true },
      },
      customAttributes: {
        // Mirrors profiles.role ('clinician' | 'patient')
        role: new cognito.StringAttribute({ mutable: true }),
        // UUID of the user's clinic
        clinic_id: new cognito.StringAttribute({ mutable: true }),
      },
      passwordPolicy: {
        minLength: 10,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
        tempPasswordValidity: cdk.Duration.days(7),
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      // Emails sent via Cognito default SES sandbox for staging.
      // For prod: configure a verified SES identity and set emailSettings.
      email: cognito.UserPoolEmail.withCognito(),
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // App client used by Next.js (no secret — browser-compatible).
    const userPoolClient = userPool.addClient("NextjsClient", {
      userPoolClientName: `grand-health-${stage}-nextjs`,
      authFlows: {
        userPassword: true,       // password sign-in
        userSrp: true,            // SRP (more secure password flow)
        custom: true,             // custom auth for email OTP / magic link
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: isProd
          ? ["https://YOUR_PROD_DOMAIN/auth/callback"]
          : ["http://localhost:3000/auth/callback", "https://YOUR_STAGING_DOMAIN/auth/callback"],
        logoutUrls: isProd
          ? ["https://YOUR_PROD_DOMAIN/login"]
          : ["http://localhost:3000/login", "https://YOUR_STAGING_DOMAIN/login"],
      },
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      preventUserExistenceErrors: true,
    });

    // Domain for the hosted UI (used by OAuth flows if needed).
    userPool.addDomain("Domain", {
      cognitoDomain: { domainPrefix: `grand-health-${stage}` },
    });

    // ── Outputs (consumed by .env + Amplify console) ──────────────────────────
    new cdk.CfnOutput(this, "UserPoolId", {
      value: userPool.userPoolId,
      exportName: `GrandHealth-${stage}-UserPoolId`,
    });

    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
      exportName: `GrandHealth-${stage}-UserPoolClientId`,
    });

    new cdk.CfnOutput(this, "DbSecretArn", {
      value: dbSecret.secretArn,
      exportName: `GrandHealth-${stage}-DbSecretArn`,
    });

    new cdk.CfnOutput(this, "VpcId", {
      value: vpc.vpcId,
      exportName: `GrandHealth-${stage}-VpcId`,
    });

    // ── App hosting: ECS Fargate + ALB (in this VPC, reaches private RDS) ─────
    // Phase 1 (default): creates ECR repo + GitHub deploy role + app-env secret.
    // Phase 2 (`-c withService=true`, after an image is pushed): adds the
    // Fargate service + load balancer.
    new AppRuntime(this, "AppRuntime", {
      vpc,
      stage,
      githubRepo: "tdennis-blip/grand-health-app",
      deployService: this.node.tryGetContext("withService") === "true",
    });

    // ── Tags (HIPAA requires resource tagging for auditing) ───────────────────
    cdk.Tags.of(this).add("Project", "GrandHealth");
    cdk.Tags.of(this).add("Stage", stage);
    cdk.Tags.of(this).add("PHI", "true");
  }
}
