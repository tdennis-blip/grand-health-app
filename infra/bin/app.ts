#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { GrandHealthStack } from "../lib/grand-health-stack";

const app = new cdk.App();

new GrandHealthStack(app, "GrandHealthStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
  },
  // Toggle for prod vs staging
  stage: (app.node.tryGetContext("stage") as string) ?? "staging",
});
