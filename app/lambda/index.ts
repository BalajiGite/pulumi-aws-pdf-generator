import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { Queues } from "../sqs";
import { pdfBucket } from "../s3";
import { ManagedPolicies } from "@pulumi/aws/iam";
//import {nodemailer} from "nodemailer";
var nodemailer = require('nodemailer');
var smtpTransport = require('nodemailer-smtp-transport');

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

const generatePdf = async (linkToRepFile:string ): Promise<Buffer> => {
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
    const url = `https://main.d1oiqip01l7i2k.amplifyapp.com/dashboard?linktoreport=${linkToRepFile}`
    await page.goto(url, {waitUntil: 'networkidle2'})
    await page.waitFor(1000);
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

const generateImage = async (linkToRepFile:string ): Promise<Buffer> => {
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
    await page.setViewport({ width: 795, height: 800 })
    const url = `https://main.d1oiqip01l7i2k.amplifyapp.com/dashboard?linktoreport=${linkToRepFile}`
    await page.goto(url, {waitUntil: 'networkidle2'})
    await page.waitFor(1000);
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
      const {emailToList, emailCcList,  emailBccList, emailSubject, emailBody, linkToRepFile  } = JSON.parse(body) as {
        emailToList: Array<string>;
        emailCcList: Array<string>;
        emailBccList: Array<string>;
        emailSubject:string;
        emailBody:string;
        linkToRepFile:string;
      };

      console.log(emailToList);
       // send email with signed url
       //const ses = new aws.sdk.SES({ region: "ap-southeast-2" });

      // generate pdf
      const pdf = await generatePdf(linkToRepFile);
      const pdfName = `${messageId}.pdf`;

      const png = await generateImage(linkToRepFile);
      const pngName = `${messageId}.png`;

      // upload pdf to s3
      const s3 = new aws.sdk.S3({ region: "ap-southeast-2" });

      //upload blank textFile in s3
      await s3.putObject({
        Bucket: 'gems2jsonreports',
        Key: 'lambdaExecutionLocks/emailSendingLock.txt',
        Body: Buffer.from('Hello', 'utf8'),
        ContentType: "application/text",
      }).promise();

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
        Expires: 60 * 60 * 24 * 30, // 7 days
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
        Expires: 60 * 60 * 24 * 30, // 30 days
      });
      
      
      var mailOptions = {
        from: senderEmail,
        subject:  `${emailSubject}`,
        //html: `<p style="font-size:16px"><b>Click <a href="${signedUrl}">here</a> to downlaod ${siteName} Report. <b></p><br/><img src=\"${signedUrlPng}\"" alt="Energy app" />`,
        //html: `<p style="font-size:16px"><b>${emailBody}<b></p><br/><img src=\"${signedUrlPng}\"" alt="Energy app" />`,
        html: `<p style="font-size:16px"><b>${emailBody}<b></p><br/><img src="cid:bigimg@gegroup.com.au" alt="Energy app" />`,
        
        to: emailToList,
        cc:emailCcList,
        bcc: emailBccList,
        attachments: [
          {
            filename: `${emailSubject}.pdf`,
            content: pdf,
          },{
            filename: `${emailSubject}.png`,
            content: png,
            cid: 'bigimg@gegroup.com.au'
          }
        ],
      };

      return new Promise((resolve,reject)=>{
        var transporter = nodemailer.createTransport({
          //SES: ses
          host: 'email-smtp.ap-southeast-2.amazonaws.com',
          port: 587,
          secure: false,
          requireTLS: true,
          auth: {
              user: 'AKIA56UE5WHAGVCIAFOW',
              pass: 'BIIpsYbQcphH5AgALR/kRNmZpSdazY6ZfoXCIkOwK7yQ'
          }
        });

       let resp=false;
       
       transporter.sendMail(mailOptions, function(error: string, info: { response: string; }){
           if (error) {
               console.log("error is "+error);
              resolve(false); // or use rejcet(false) but then you will have to handle errors
           } 
          else {
              console.log('Email sent: ' + info.response);
              resolve(true);
           }
          });

          var params = {  Bucket: 'gems2jsonreports', Key: 'lambdaExecutionLocks/emailSendingLock.txt' };
          s3.deleteObject(params, function(err, data) {
            if (err) console.log(err, err.stack);  // error
            else     console.log();                 // deleted
          }).promise();
      })  
       

      /*
      //added transporter
      var transporter = nodemailer.createTransport({
        //SES: ses
        host: 'email-smtp.ap-southeast-2.amazonaws.com',
        port: 587,
        secure: false,
        requireTLS: true,
        auth: {
            user: 'AKIA56UE5WHAGVCIAFOW',
            pass: 'BIIpsYbQcphH5AgALR/kRNmZpSdazY6ZfoXCIkOwK7yQ'
        }
      });

      await transporter.sendMail(mailOptions, function (err: any, info: any) {
        if (err) {
            console.log(err);
            console.log('Error sending email');
            callback(err);
        } else {
            console.log('Email sent successfully');
        }
      }).promise();

      //upload blank textFile in s3
      await s3.deleteObject({
        Bucket: 'gems2jsonreports',
        Key: 'lambdaExecutionLocks/emailSendingLock.txt'
      }).promise();

 

      // delete message from queue
      await sqs.deleteMessage({ QueueUrl: Queues.pdfProcessingQueue.url.get(), ReceiptHandle: receiptHandle }).promise();
      console.log(`Deleted message ${messageId} from queue`); */
    });
    await Promise.all(processedEventPromises);
  },
  memorySize: 5072,
  runtime: aws.lambda.Runtime.NodeJS14dX,
  timeout: 300,
  layers: [pdfLayer.arn],
  policies: [ManagedPolicies.AmazonSESFullAccess, ManagedPolicies.AmazonS3FullAccess, ManagedPolicies.AmazonSQSFullAccess, ManagedPolicies.AWSLambdaBasicExecutionRole, ManagedPolicies.CloudWatchFullAccess],
});
function callback(err: any) {
  throw new Error(err);
}

