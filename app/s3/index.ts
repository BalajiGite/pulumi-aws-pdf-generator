import * as aws from "@pulumi/aws";

const provider = new aws.Provider("provider", { region: 'eu-central-1' });

export const pdfBucket = new aws.s3.Bucket("report-pdf-bucket", {
    bucket: "report-pdf-bucket",
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
                Resource: `arn:aws:s3:::pdf-bucket-big/pdf/*`
            },
            {
                Sid: 'AllowGetObjectForLambda',
                Effect: 'Allow',
                Principal: {
                    Service: 'lambda.amazonaws.com'
                },
                Action: 's3:GetObject',
                Resource: `arn:aws:s3:::pdf-bucket-big/pdf/*`
            },
        ],
    }),
}, { provider });
