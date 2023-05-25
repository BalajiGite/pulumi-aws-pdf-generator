import * as aws from "@pulumi/aws";

const provider = new aws.Provider("provider", { region: 'ap-southeast-2' });

export const pdfBucket = new aws.s3.Bucket("report-pdfs-bucket", {
    bucket: "report-pdfs-bucket",
    acl: 'private',
    policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
            {
                Sid: 'AllowPutObjectForLambda',
                Effect: 'Allow',
                Principal: {
                    Service: 'lambda.amazonaws.com'
                },
                Action: 's3:PutObject',
                Resource: `arn:aws:s3:::report-pdfs-bucket/pdf/*`
            },
            {
                Sid: 'AllowGetObjectForLambda',
                Effect: 'Allow',
                Principal: {
                    Service: 'lambda.amazonaws.com'
                },
                Action: 's3:GetObject',
                Resource: `arn:aws:s3:::report-pdfs-bucket/pdf/*`
            },
            {
                Sid: 'AllowPutObjectForLambda',
                Effect: 'Allow',
                Principal: {
                    Service: 'lambda.amazonaws.com'
                },
                Action: 's3:PutObject',
                Resource: `arn:aws:s3:::report-pdfs-bucket/json/*`
            },
            {
                Sid: 'AllowGetObjectForLambda',
                Effect: 'Allow',
                Principal: {
                    Service: 'lambda.amazonaws.com'
                },
                Action: 's3:GetObject',
                Resource: `arn:aws:s3:::report-pdfs-bucket/json/*`
            },
            {
                Sid: 'AllowPutObjectForLambda',
                Effect: 'Allow',
                Principal: {
                    Service: 'lambda.amazonaws.com'
                },
                Action: 's3:PutObject',
                Resource: `arn:aws:s3:::report-pdfs-bucket/png/*`
            },
            {
                Sid: 'AllowGetObjectForLambda',
                Effect: 'Allow',
                Principal: {
                    Service: 'lambda.amazonaws.com'
                },
                Action: 's3:GetObject',
                Resource: `arn:aws:s3:::report-pdfs-bucket/png/*`
            },
        ],
    }),
}, { provider });
