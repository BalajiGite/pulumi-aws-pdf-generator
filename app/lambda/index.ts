import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { Queues } from "../sqs";
import { pdfBucket } from "../s3";
import { ManagedPolicies } from "@pulumi/aws/iam";
//import {nodemailer} from "nodemailer";
var nodemailer = require('nodemailer');

const config = new pulumi.Config();
const senderEmail = config.require('sender-email');

const pdfLayer = new aws.lambda.LayerVersion("pdfLayer", {
  layerName: "pdfLayer",
  code: new pulumi.asset.AssetArchive({
    "": new pulumi.asset.FileArchive("./lambda/layer/chrome_aws_lambda.zip"),
  }),
  compatibleRuntimes: [aws.lambda.Runtime.NodeJS14dX],
});

const sqs = new aws.sdk.SQS({ region: "ap-southeast-2" });

const generatePdf = async (utilityType: string,startDate: string, endDate:string,siteName:string,frequency:string ): Promise<Buffer> => {
  const chromium = require('chrome-aws-lambda');
  let browser: any = undefined;
  try {
    // launch a headless chrome instance
    const executablePath = await chromium.executablePath;
    browser = await chromium.puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
    });

    // create a new page
    const page = await browser.newPage();
    
    //await page.setContent(html);
    const url = `https://main.d1oiqip01l7i2k.amplifyapp.com/dashboard?startDate=${startDate}&endDate=${endDate}&frequency=${frequency}&site=${siteName}&utilityType=${utilityType}`
    await page.goto(url, {waitUntil: 'networkidle2'})
    await page.waitFor(2000);
    await page.emulateMediaType('print')
    await page.emulateMediaType('screen')
    // generate the pdf as a buffer and return it
    return (await page.pdf({ format: "Letter", printBackground: true, margin:{top: "0px",  right: "20px", left: "20px", bottom:"0px"}})) as Buffer;
  } catch (err) {
    console.error(err);
    throw err;
  } finally {
    if (browser !== undefined) {
      // close the browser
      await browser.close();
    }
  }
};

const generateImage = async (utilityType: string,startDate: string, endDate:string,siteName:string,frequency:string ): Promise<Buffer> => {
  const chromium = require('chrome-aws-lambda');
  let browser: any = undefined;
  try {
    // launch a headless chrome instance
    const executablePath = await chromium.executablePath;
    browser = await chromium.puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
    });

    // create a new page
    const page = await browser.newPage();
    
    //await page.setContent(html) from UI;
    await page.setViewport({ width: 1000, height: 800 })
    const url = `https://main.d1oiqip01l7i2k.amplifyapp.com/dashboard?startDate=${startDate}&endDate=${endDate}&frequency=${frequency}&site=${siteName}&utilityType=${utilityType}`
    await page.goto(url, {waitUntil: 'networkidle2'})
    await page.waitFor(2000);
    await page.emulateMediaType('print')
    await page.emulateMediaType('screen')
    
    // generate the pdf as a buffer and return it
    return await page.screenshot({  fullPage: true });
  } catch (err) {
    console.error(err);
    throw err;
  } finally {
    if (browser !== undefined) {
      // close the browser
      await browser.close();
    }
  }
};

export const pdfProcessingLambda = new aws.lambda.CallbackFunction("pdfProcessingLambda", {
  callback: async (event: aws.sqs.QueueEvent) => {
    const processedEventPromises = event.Records.map(async (record) => {
      const { messageId, body, receiptHandle } = record;
      const {email, utilityType,  startDate, endDate, siteName, frequency  } = JSON.parse(body) as {
        email: string;
        utilityType: string;
        startDate: string;
        endDate:string;
        siteName:string;
        frequency:string;
      };

       // send email with signed url
       const ses = new aws.sdk.SES({ region: "ap-southeast-2" });

      // generate pdf
      const pdf = await generatePdf(utilityType, startDate, endDate, siteName, frequency);
      const pdfName = `${messageId}.pdf`;

      const png = await generateImage(utilityType, startDate, endDate, siteName, frequency);
      const pngName = `${messageId}.png`;

      // upload pdf to s3
      const s3 = new aws.sdk.S3({ region: "eu-central-1" });
      await s3.putObject({
        Bucket: pdfBucket.bucket.get(),
        Key: `pdf/${pdfName}`,
        Body: pdf,
        ContentType: "application/pdf",
      }).promise();

    
       // generate signed url from s3 for public reads.
       const signedUrl = await s3.getSignedUrlPromise("getObject", {
        Bucket: pdfBucket.bucket.get(),
        Key: `pdf/${pdfName}`,
        Expires: 60 * 60 * 24 * 7, // 7 days
      });

      await s3.putObject({
        Bucket: pdfBucket.bucket.get(),
        Key: `png/${pngName}`,
        Body: png,
        ContentType: "image/png",
      }).promise();

      // generate signed url from s3 for public reads.
      const signedUrlPng = await s3.getSignedUrlPromise("getObject", {
        Bucket: pdfBucket.bucket.get(),
        Key: `png/${pngName}`,
        Expires: 60 * 60 * 24 * 7, // 7 days
      });
      
      let sub = "";
      let attName = ""
      if(frequency=="H"){
        sub = " - Hourly Consumption-Target Report - Electricity kwh";
        attName = "Hourly Consumption-Target Report - Electricity kwh";
      }else if(frequency == "D"){
        sub = " - Daily Consumption-Target Report - Electricity kwh";
        attName = "Daily Consumption-Target Report - Electricity kwh";
      }else{
        sub = " - Consumption-Target Report - Electricity kwh";
        attName = "Consumption-Target Report - Electricity kwh";
      }
     
      var mailOptions = {
        from: senderEmail,
        subject:  `${siteName}` + `${sub}`,
        //html: `<p style="font-size:16px"><b>Click <a href="${signedUrl}">here</a> to downlaod ${siteName} Report. <b></p><br/><img src=\"${signedUrlPng}\"" alt="Energy app" />`,
        html: `<p style="font-size:16px"></p><br/><img src=\"${signedUrlPng}\"" alt="Energy app" />`,
        
        to: [email],
        // bcc: Any BCC address you want here in an array,
        attachments: [
          {
            filename: `${attName}.pdf`,
            content: pdf,
          }/*,{
            filename: `${attName}.png`,
            content: png,
          }*/
        ],
      };

      var transporter = nodemailer.createTransport({
        SES: ses
      });

      transporter.sendMail(mailOptions, function (err: any, info: any) {
        if (err) {
            console.log(err);
            console.log('Error sending email');
            callback(err);
        } else {
            console.log('Email sent successfully');
        }
      });

      /*await ses.sendEmail({
        Source: senderEmail,
        Destination: { ToAddresses: [email], },
        Message: {
          Body: { Html: { Charset: "UTF-8", Data: `<p style="font-size:16px"><b>Click <a href="${signedUrl}">here </a>to downlaod ${siteName} PDF Report. <b></p><br/><img src=\"${signedUrlPng}\"" alt="Energy app" />` ,}, },
          Subject: { Data: `${siteName}` + `${sub}`, Charset: "UTF-8" },
        },
      }).promise();*/

      // delete message from queue
      await sqs.deleteMessage({ QueueUrl: Queues.pdfProcessingQueue.url.get(), ReceiptHandle: receiptHandle }).promise();
      console.log(`Deleted message ${messageId} from queue`);
    });
    await Promise.all(processedEventPromises);
  },
  memorySize: 3072,
  runtime: aws.lambda.Runtime.NodeJS14dX,
  timeout: 120,
  layers: [pdfLayer.arn],
  policies: [ManagedPolicies.AmazonSESFullAccess, ManagedPolicies.AmazonS3FullAccess, ManagedPolicies.AmazonSQSFullAccess, ManagedPolicies.AWSLambdaBasicExecutionRole, ManagedPolicies.CloudWatchFullAccess],
});
function callback(err: any) {
  throw new Error("Function not implemented.");
}

