const Imap = require('imap');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const nodemailer = require('nodemailer');
const path = require('path');
const mimemessage = require('mimemessage');

const imap = new Imap({
    user: 'xxxx@gmail.com',
    password: 'asdasdf', // Replace with your app password
    host: 'imap.gmail.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false }
});

function openInbox(cb) {
    imap.openBox('INBOX', false, cb);
}

imap.once('ready', function() {
    openInbox(function(err, box) {
        if (err) throw err;
        console.log('Connected to INBOX');
        imap.search(['UNSEEN'], function(err, results) {
            if (err) throw err;
            if (results.length === 0) {
                console.log('No unseen messages found');
                imap.end();
                return;
            }
            // Get the latest unseen email
            const latest = results[results.length - 1];
            const fetch = imap.fetch([latest], { bodies: '' });
            fetch.on('message', function(msg, seqno) {
                let buffer = '';
                msg.on('body', function(stream, info) {
                    stream.on('data', function(chunk) {
                        buffer += chunk.toString('utf8');
                    });
                });
                msg.once('end', function() {
                    // Save email as .eml file
                    const emlFilePath = `email-${seqno}.eml`;
                    fs.writeFileSync(emlFilePath, buffer);
                    console.log(`Saved email-${seqno}.eml`);

                    // Parse the email and save as .html file
                    simpleParser(buffer, (err, mail) => {
                        if (err) {
                            console.error('Error parsing email:', err);
                            return;
                        }
                        const htmlFilePath = `email-${seqno}.html`;
                        const html = mail.html || mail.textAsHtml || mail.text;
                        fs.writeFileSync(htmlFilePath, html);
                        console.log(`Saved email-${seqno}.html`);

                        // Extract inline images
                        const attachments = mail.attachments || [];
                        const inlineImages = attachments.filter(att => att.contentDisposition === 'inline');
                        const imageFilePaths = [];

                        inlineImages.forEach((image, index) => {
                            const imageFilePath = path.join(__dirname, `image-${seqno}-${index}.${image.contentType.split('/')[1]}`);
                            fs.writeFileSync(imageFilePath, image.content);
                            imageFilePaths.push(imageFilePath);
                            console.log(`Saved inline image: ${imageFilePath}`);
                        });

                        // Create .msg file
                        const msgFilePath = `email-${seqno}.msg`;
                        const msg = mimemessage.factory({
                            contentType: 'multipart/mixed',
                            body: []
                        });
                        msg.header('From', mail.from.value.map(f => f.address).join(', '));
                        msg.header('To', mail.to.value.map(t => t.address).join(', '));
                        msg.header('Subject', mail.subject);

                        const plainTextEntity = mimemessage.factory({
                            contentType: 'text/plain',
                            body: mail.text
                        });
                        msg.body.push(plainTextEntity);

                        if (mail.html) {
                            const htmlEntity = mimemessage.factory({
                                contentType: 'text/html',
                                body: mail.html
                            });
                            msg.body.push(htmlEntity);
                        }

                        attachments.forEach(att => {
                            const attachmentEntity = mimemessage.factory({
                                contentType: att.contentType,
                                contentTransferEncoding: 'base64',
                                body: att.content.toString('base64')
                            });
                            attachmentEntity.header('Content-Disposition', att.contentDisposition + `; filename="${att.filename}"`);
                            msg.body.push(attachmentEntity);
                        });

                        fs.writeFileSync(msgFilePath, msg.toString());
                        console.log(`Saved email-${seqno}.msg`);

                        // Send email with attachments
                        sendEmailWithAttachment(emlFilePath, htmlFilePath, imageFilePaths, msgFilePath);
                    });
                });
            });
            fetch.once('error', function(err) {
                console.error('Fetch error:', err);
            });
            fetch.once('end', function() {
                console.log('Done fetching the latest unseen message');
                imap.end();
            });
        });
    });
});

imap.once('error', function(err) {
    console.error('IMAP error:', err);
});

imap.once('end', function() {
    console.log('Connection ended');
});

imap.connect();

function sendEmailWithAttachment(emlFilePath, htmlFilePath, imageFilePaths, msgFilePath) {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'xxxxx@gmail.com',
            pass: 'asdfadsf' // Replace with your email password or app password
        }
    });

    const attachments = [
        {
            filename: emlFilePath.split('/').pop(),
            path: emlFilePath
        },
        {
            filename: htmlFilePath.split('/').pop(),
            path: htmlFilePath
        },
        {
            filename: msgFilePath.split('/').pop(),
            path: msgFilePath
        }
    ];

    imageFilePaths.forEach(filePath => {
        attachments.push({
            filename: filePath.split('/').pop(),
            path: filePath
        });
    });

    const mailOptions = {
        from: 'xxxx@gmail.com', // Replace with your email
        to: 'xxxx@gmail.com', // Replace with recipient email
        subject: 'Forwarded Email',
        text: 'Please find the attached email and images.',
        attachments: attachments
    };

    transporter.sendMail(mailOptions, function(error, info) {
        if (error) {
            console.error('Error sending email:', error);
        } else {
            console.log('Email sent:', info.response);
        }
    });
}
