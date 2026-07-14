import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsp from "aws-cdk-lib/aws-ecs-patterns";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Construct } from "constructs";

export interface AppRuntimeProps {
  vpc: ec2.IVpc;
  stage: string;
  /** "owner/repo" allowed to assume the GitHub Actions deploy role. */
  githubRepo: string;
  /**
   * Phase 2 toggle. When false (default) we only create the ECR repo, the
   * GitHub OIDC deploy role, and the app-env secret — so an image can be built
   * and pushed before any ECS service tries to pull it. Set to true (via
   * `-c withService=true`) once an image exists in ECR.
   */
  deployService: boolean;
  /**
   * Custom domain for the app, e.g. "staging.mygrandhealth.com". When set
   * (together with `hostedZoneName` and `deployService`), the ALB serves HTTPS
   * on this domain with an ACM cert, HTTP is redirected to HTTPS, and an alias
   * record is created in the hosted zone.
   */
  domainName?: string;
  /** Route 53 hosted zone the domain lives in, e.g. "mygrandhealth.com". */
  hostedZoneName?: string;
}

/**
 * App hosting on ECS Fargate behind an Application Load Balancer.
 * Lives inside the existing VPC, so Fargate tasks can reach the private RDS
 * instance directly (the RDS security group already admits the VPC CIDR).
 */
export class AppRuntime extends Construct {
  public readonly repository: ecr.Repository;
  public readonly appEnvSecret: secretsmanager.Secret;
  public readonly clusterName: string;
  public readonly serviceName: string;

  constructor(scope: Construct, id: string, props: AppRuntimeProps) {
    super(scope, id);
    const { vpc, stage, githubRepo, deployService, domainName, hostedZoneName } = props;
    const isProd = stage === "prod";
    this.clusterName = `grand-health-${stage}`;
    this.serviceName = `grand-health-${stage}-web`;

    // ── ECR repository ────────────────────────────────────────────────────────
    this.repository = new ecr.Repository(this, "Repo", {
      repositoryName: `grand-health-${stage}`,
      imageScanOnPush: true, // HIPAA: scan images for CVEs
      lifecycleRules: [{ maxImageCount: 15 }],
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: !isProd,
    });

    // ── App runtime secrets (filled in by you after first deploy) ─────────────
    // One JSON secret holds every runtime secret the container needs. Values
    // start as REPLACE_ME placeholders; update them in Secrets Manager with the
    // real connection strings + API keys from your .env.local.
    //
    // ⚠️ DO NOT EDIT `secretObjectValue` ON A LIVE ENVIRONMENT. CloudFormation
    // treats a change to this map as a new desired secret value and OVERWRITES
    // the whole secret back to these REPLACE_ME placeholders on the next deploy,
    // wiping DATABASE_URL and every other real value (caused a full staging
    // outage on 2026-06-22). To expose a NEW env var to the container, add a key
    // to the `secrets` map below (ecs.Secret.fromSecretsManager) and set its
    // value directly in Secrets Manager with `put-secret-value` — leave this
    // block alone.
    this.appEnvSecret = new secretsmanager.Secret(this, "AppEnv", {
      secretName: `grand-health/${stage}/app-env`,
      secretObjectValue: {
        DATABASE_URL: cdk.SecretValue.unsafePlainText("REPLACE_ME"),
        SERVICE_ROLE_DATABASE_URL: cdk.SecretValue.unsafePlainText("REPLACE_ME"),
        USDA_API_KEY: cdk.SecretValue.unsafePlainText("REPLACE_ME"),
        ANTHROPIC_API_KEY: cdk.SecretValue.unsafePlainText("REPLACE_ME"),
        CLOUDINARY_CLOUD_NAME: cdk.SecretValue.unsafePlainText("REPLACE_ME"),
        CLOUDINARY_API_KEY: cdk.SecretValue.unsafePlainText("REPLACE_ME"),
        CLOUDINARY_API_SECRET: cdk.SecretValue.unsafePlainText("REPLACE_ME"),
        OURA_CLIENT_ID: cdk.SecretValue.unsafePlainText("REPLACE_ME"),
        OURA_CLIENT_SECRET: cdk.SecretValue.unsafePlainText("REPLACE_ME"),
        OURA_WEBHOOK_SECRET: cdk.SecretValue.unsafePlainText("REPLACE_ME"),
      },
    });

    // ── GitHub Actions OIDC deploy role ───────────────────────────────────────
    // Lets the CI workflow push images + roll the ECS service WITHOUT long-lived
    // AWS keys. If your account already has a GitHub OIDC provider, replace the
    // `new` below with OpenIdConnectProvider.fromOpenIdConnectProviderArn(...).
    const githubOidc = new iam.OpenIdConnectProvider(this, "GithubOidc", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"],
    });

    const deployRole = new iam.Role(this, "GithubDeployRole", {
      roleName: `grand-health-${stage}-gh-deploy`,
      assumedBy: new iam.WebIdentityPrincipal(githubOidc.openIdConnectProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        },
        StringLike: {
          "token.actions.githubusercontent.com:sub": `repo:${githubRepo}:*`,
        },
      }),
      description: "Assumed by GitHub Actions to build/push images and deploy ECS",
    });
    this.repository.grantPullPush(deployRole);
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ecr:GetAuthorizationToken"],
        resources: ["*"], // required, not resource-scopable
      })
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "ecs:DescribeServices",
          "ecs:DescribeTaskDefinition",
          "ecs:RegisterTaskDefinition",
          "ecs:UpdateService",
          "ecs:DescribeClusters",
        ],
        resources: ["*"],
      })
    );
    // Allow CI to pass the task/exec roles to ECS when registering task defs.
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["iam:PassRole"],
        resources: ["*"],
        conditions: {
          StringEquals: { "iam:PassedToService": "ecs-tasks.amazonaws.com" },
        },
      })
    );

    new cdk.CfnOutput(this, "EcrRepositoryUri", { value: this.repository.repositoryUri });
    new cdk.CfnOutput(this, "GithubDeployRoleArn", { value: deployRole.roleArn });
    new cdk.CfnOutput(this, "AppEnvSecretArn", { value: this.appEnvSecret.secretArn });

    // ── Phase 1 stops here. Service + ALB only when an image exists. ──────────
    if (!deployService) return;

    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc,
      clusterName: this.clusterName,
      containerInsights: true, // HIPAA: monitoring
    });

    const logGroup = new logs.LogGroup(this, "Logs", {
      logGroupName: `/grand-health/${stage}/web`,
      retention: isProd ? logs.RetentionDays.ONE_YEAR : logs.RetentionDays.ONE_MONTH,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // ── Custom domain + TLS (optional) ────────────────────────────────────────
    // When a domain + hosted zone are supplied, look up the zone and mint an
    // ACM cert validated via DNS. The cert + zone are handed to the ALB service
    // below so it terminates HTTPS and creates the alias record automatically.
    let zone: route53.IHostedZone | undefined;
    let certificate: acm.ICertificate | undefined;
    if (domainName && hostedZoneName) {
      zone = route53.HostedZone.fromLookup(this, "Zone", {
        domainName: hostedZoneName,
      });
      certificate = new acm.Certificate(this, "Cert", {
        domainName,
        validation: acm.CertificateValidation.fromDns(zone),
      });
    }

    // Non-secret, build-time-inlined client config (also read server-side).
    const siteUrl =
      this.node.tryGetContext("siteUrl") ??
      (domainName ? `https://${domainName}` : "http://PLACEHOLDER");
    const environment: Record<string, string> = {
      NODE_ENV: "production",
      PORT: "3000",
      NEXT_PUBLIC_AWS_REGION: "us-east-1",
      NEXT_PUBLIC_COGNITO_USER_POOL_ID: "us-east-1_Yk5gVyw4D",
      NEXT_PUBLIC_COGNITO_CLIENT_ID: "n9pkk4kb0doa5hhspsv510ecq",
      NEXT_PUBLIC_SITE_URL: siteUrl,
      // Bedrock meal-plan model. The "us." prefix targets the cross-region
      // inference profile — newer Anthropic models on Bedrock require it for
      // on-demand invocation (the bare foundation-model ID is rejected).
      BEDROCK_MODEL_ID: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
      BEDROCK_REGION: "us-east-1",
    };

    const secrets: Record<string, ecs.Secret> = {
      DATABASE_URL: ecs.Secret.fromSecretsManager(this.appEnvSecret, "DATABASE_URL"),
      SERVICE_ROLE_DATABASE_URL: ecs.Secret.fromSecretsManager(this.appEnvSecret, "SERVICE_ROLE_DATABASE_URL"),
      USDA_API_KEY: ecs.Secret.fromSecretsManager(this.appEnvSecret, "USDA_API_KEY"),
      ANTHROPIC_API_KEY: ecs.Secret.fromSecretsManager(this.appEnvSecret, "ANTHROPIC_API_KEY"),
      CLOUDINARY_CLOUD_NAME: ecs.Secret.fromSecretsManager(this.appEnvSecret, "CLOUDINARY_CLOUD_NAME"),
      CLOUDINARY_API_KEY: ecs.Secret.fromSecretsManager(this.appEnvSecret, "CLOUDINARY_API_KEY"),
      CLOUDINARY_API_SECRET: ecs.Secret.fromSecretsManager(this.appEnvSecret, "CLOUDINARY_API_SECRET"),
      OURA_CLIENT_ID: ecs.Secret.fromSecretsManager(this.appEnvSecret, "OURA_CLIENT_ID"),
      OURA_CLIENT_SECRET: ecs.Secret.fromSecretsManager(this.appEnvSecret, "OURA_CLIENT_SECRET"),
      OURA_WEBHOOK_SECRET: ecs.Secret.fromSecretsManager(this.appEnvSecret, "OURA_WEBHOOK_SECRET"),
    };

    const service = new ecsp.ApplicationLoadBalancedFargateService(this, "Service", {
      cluster,
      serviceName: this.serviceName,
      cpu: 512,
      memoryLimitMiB: 1024,
      desiredCount: 1,
      publicLoadBalancer: true,
      // Tasks run in the egress-private subnets (NAT for ECR pulls), NOT public.
      taskSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
      healthCheckGracePeriod: cdk.Duration.seconds(120),
      circuitBreaker: { rollback: true },
      // HTTPS on the custom domain when a cert/zone were resolved above;
      // otherwise the ALB stays on plain HTTP.
      ...(certificate && zone
        ? {
            certificate,
            domainName,
            domainZone: zone,
            protocol: elbv2.ApplicationProtocol.HTTPS,
            redirectHTTP: true,
            sslPolicy: elbv2.SslPolicy.RECOMMENDED,
          }
        : {}),
      taskImageOptions: {
        image: ecs.ContainerImage.fromEcrRepository(this.repository, "latest"),
        containerPort: 3000,
        family: this.serviceName,
        environment,
        secrets,
        logDriver: ecs.LogDrivers.awsLogs({ streamPrefix: "web", logGroup }),
      },
    });

    // Login page returns 200 for signed-out users — good health signal.
    service.targetGroup.configureHealthCheck({
      path: "/login",
      healthyHttpCodes: "200-399",
      interval: cdk.Duration.seconds(30),
      timeout: cdk.Duration.seconds(10),
    });

    // Let the app provision Cognito users (clinician "Add patient/staff" flow).
    service.taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminSetUserPassword",
          "cognito-idp:AdminUpdateUserAttributes",
          "cognito-idp:AdminDeleteUser",
          // Deactivation flows disable/re-enable the login (2026-07-14 review).
          "cognito-idp:AdminDisableUser",
          "cognito-idp:AdminEnableUser",
        ],
        resources: [
          `arn:aws:cognito-idp:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:userpool/us-east-1_Yk5gVyw4D`,
        ],
      })
    );

    // Bedrock: AI meal-plan generation runs Claude via Bedrock so PHI stays
    // under the AWS BAA (no Anthropic-direct key needed in production).
    // Scoped to Anthropic models + inference profiles in this region.
    service.taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          `arn:aws:bedrock:${cdk.Stack.of(this).region}::foundation-model/anthropic.*`,
          `arn:aws:bedrock:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:inference-profile/us.anthropic.*`,
          // Cross-region inference profiles route through other US regions.
          `arn:aws:bedrock:us-*::foundation-model/anthropic.*`,
        ],
      })
    );

    new cdk.CfnOutput(this, "AlbUrl", {
      value: domainName
        ? `https://${domainName}`
        : `http://${service.loadBalancer.loadBalancerDnsName}`,
      description: domainName
        ? "Staging app URL (HTTPS via custom domain)"
        : "Staging app URL (HTTP until TLS is added)",
    });
    new cdk.CfnOutput(this, "AlbDnsName", {
      value: service.loadBalancer.loadBalancerDnsName,
      description: "Raw ALB DNS name (target of the Route 53 alias)",
    });
  }
}
