const Imap = require('imap');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const nodemailer = require('nodemailer');

const imap = new Imap({
    user: 'xxxx@gmail.com',
    password: 'xxxxxx', // Replace with your app password
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

                        // Send email as attachment
                        sendEmailWithAttachment(emlFilePath, htmlFilePath);
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

function sendEmailWithAttachment(emlFilePath, htmlFilePath) {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'xxxxx@gmail.com',
            pass: 'xxxxx' // Replace with your email password or app password
        }
    });

    const mailOptions = {
        from: 'xxxx@gmail.com', // Replace with your email
        to: 'yyyy@gmail.com', // Replace with recipient email
        subject: 'Forwarded Email',
        text: 'Please find the attached email.',
        attachments: [
            {
                filename: emlFilePath.split('/').pop(),
                path: emlFilePath
            },
            {
                filename: htmlFilePath.split('/').pop(),
                path: htmlFilePath
            }
        ]
    };

    transporter.sendMail(mailOptions, function(error, info) {
        if (error) {
            console.error('Error sending email:', error);
        } else {
            console.log('Email sent:', info.response);
        }
    });
}