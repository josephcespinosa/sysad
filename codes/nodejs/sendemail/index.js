var nodemailer;
var sgmailer;
var PubSub;

const ACTIVE_MAILER = process.env.ACTIVE_MAILER;
const SENDER = process.env.SENDER;
const SENDER_ALIAS = process.env.SENDER_ALIAS;

// if ACTIVE_MAILER = sendgrid
const SENDGRID_KEY = process.env.SENDGRID_KEY;

// if ACTIVE_MAILER = mailhog
const MAILHOG_HOST = process.env.MAILHOG_HOST;
const MAILHOG_PORT = process.env.MAILHOG_PORT;

// if ACTIVE_MAILER = mailtrap
const MAILTRAP_USER = process.env.MAILTRAP_USER;
const MAILTRAP_PASS = process.env.MAILTRAP_PASS;

// if ACTIVE_MAILER = office365
const OFFICE365_USER = process.env.OFFICE365_USER;
const OFFICE365_PASS = process.env.OFFICE365_PASS;

async function sendEmail(req, res) {
    try {
        console.log('Payload: ', JSON.stringify({...req.body, text: '', html: '', to: ''}))

        if (!req.body || !isRequestBodyValid(req.body)) {
            throw new Error('Missing/invalid arguments!');
        }

        if (!process.env.SENDER) {
            throw new Error('Missing configuration.');
        }

        try {
            let response;

            switch (ACTIVE_MAILER) {
                case 'office365':
                    response = await office365Mailer(req.body);
                    break;
                case 'sendgrid':
                    response = await sendGridMailer(req.body);
                    break;
                case 'mailhog':
                    response = await mailHogMailer(req.body);
                    break;
                case 'mailtrap':
                default:
                    response = await mailTrapMailer(req.body);
                    break;
            }

            console.log(JSON.stringify(response));

            console.log(`Should notify? ${req.body.notify || 'no'}`);

            // Notify backend via PubSub message
            if (req.body.hasOwnProperty('notify') && (req.body.notify || req.body.notify == 'true')) {
                const {project, topic, mailId} = req.body;

                console.log(`[Mail ID: ${mailId}] Should notify: ${project} ${topic}`);

                const pubSubData = {
                    "queue_code" : req.body.mailId, 
                    "status" : "SUCCESS"
                };

                if (!project || !topic) {
                    console.log(`[${mailId}] Incomplete configuration. No [project|topic] to notify.`)
                } else {
                    console.log(`[Mail ID: ${mailId}] Pending notification to: ${project} ${topic}`);

                    await sendMessageToTopic(project, topic, pubSubData)
                        .catch(publishError => {
                            console.log(publishError)
                            console.log(`[Mail ID: ${mailId}] ${publishError}`);
                        });
                }
            }
        } catch(err) {
            console.log('error')
            console.log(err)

            const {project, fallbackTopic, mailId} = req.body;

            // fallback incase smtp is down send to failed pubsub topic
            if (err.hasOwnProperty('isMailerError') && err.isMailerError) {
                

                console.log(`[Mail ID: ${mailId}] ${err.error.message}`);

                if (!project || !fallbackTopic) {
                    console.log(`[Mail ID: ${mailId}] Incomplete configuration. No [project|fallbackTopic] to notify.`);
                } else {
                    await sendMessageToTopic(
                        project, fallbackTopic, 
                        {...req.body, error: err.error.message}
                    ).catch(async publishError => {
                        console.log(`[Mail ID: ${mailId}] ${publishError}`);
                    });
                }
            } else {
                console.log(`[Mail ID: ${mailId}] ${err.message}`);

                throw err;
            }
        }

        // return
        res.status(200).json({
            status: 200,
            message: 'Email request received'
        });
    } catch(err) {
        const {mailId} = req.body;

        console.log(`[Mail ID: ${mailId}] ${err.message}`);

        res.status(500).json({
            status: 500,
            message: err.message
        });
    }
}

async function sendGridMailer(payload) {
    sgmailer = sgmailer || require('@sendgrid/mail');
    
    sgmailer.setApiKey(SENDGRID_KEY);

    const sender = getSender(payload.senderAlias);

    return await sgmailer.send({
        from:       sender,
        to:         payload.to,
        subject:    payload.subject,
        text:       payload.text,
        html:       payload.html,
    }).catch(err => {
        console.log(err)

        throw {
            isMailerError: true,
            error: new Error(err.message)
        };
    });
}

async function mailHogMailer(payload) {
    nodemailer = nodemailer || require('nodemailer');

    if (!MAILHOG_HOST || !MAILHOG_PORT) {
        throw new Error("Missing transport configuration.");
    }
    
    const transport = nodemailer.createTransport({
        host: MAILHOG_HOST,
        port: MAILHOG_PORT
    });

    const sender = getSender(payload.senderAlias);

    return await transport.sendMail({
        from:       sender,
        to:         payload.to,
        subject:    payload.subject,
        text:       payload.text,
        html:       payload.html,
    }).catch(err => {
        console.log(err)

        throw {
            isMailerError: true,
            error: new Error(err.message)
        };
    });
}

async function mailTrapMailer(payload) {
    nodemailer = nodemailer || require('nodemailer');

    if (!MAILTRAP_USER || !MAILTRAP_PASS) {
        throw new Error("Missing transport configuration.");
    }
    
    const transport = nodemailer.createTransport({
        host: "smtp.mailtrap.io",
        port: 2525,
        auth: {
            user: MAILTRAP_USER,
            pass: MAILTRAP_PASS
        }
    });

    const sender = getSender(payload.senderAlias);

    return await transport.sendMail({
        from:       sender,
        to:         payload.to,
        subject:    payload.subject,
        text:       payload.text,
        html:       payload.html,
    }).catch(err => {
        console.log(err)

        throw {
            isMailerError: true,
            error: new Error(err.message)
        };
    });
}

async function office365Mailer(payload) {
    nodemailer = nodemailer || require('nodemailer');

    if (!OFFICE365_USER || !OFFICE365_PASS) {
        throw new Error("Missing transport configuration.");
    }
    
    const transport = nodemailer.createTransport({
        host: "smtp.office365.com",
        port: 587,
        auth: {
            user: OFFICE365_USER,
            pass: OFFICE365_PASS
        },
        secure: true
    });

    const sender = getSender(payload.senderAlias);

    return await transport.sendMail({
        from:       sender,
        to:         payload.to,
        subject:    payload.subject,
        text:       payload.text,
        html:       payload.html,
    }).catch(err => {
        console.log(err)

        throw {
            isMailerError: true,
            error: new Error(err.message)
        };
    });
}

function isRequestBodyValid(body) {
    return !(
        typeof body !== 'object' 
        || (!body.hasOwnProperty('to') || typeof body.to !== 'string' )
        || (!body.hasOwnProperty('subject') || typeof body.subject !== 'string' )
        || (!body.hasOwnProperty('text') || typeof body.text !== 'string' )
        || (!body.hasOwnProperty('html') || typeof body.html !== 'string' )
        || (!body.hasOwnProperty('mailId') || typeof body.mailId !== 'string' )
    )
}

function getSender(alias) {
    return (alias) 
        ? `${alias} <${SENDER}>`
        : SENDER_ALIAS + ` <${SENDER}>`;
}

async function sendMessageToTopic(project, topic, data) {
    PubSub = PubSub || require('@google-cloud/pubsub').PubSub;
    
    const pubSubClient = new PubSub({
        projectId: project
    });

    const dataBuffer = Buffer.from(JSON.stringify(data));

    try {
        const messageId = await pubSubClient.topic(topic).publish(dataBuffer);
        console.log(`Message ${messageId} published.`);
    } catch (error) {
        console.error(`Received error while publishing: ${error.message}`);
        process.exitCode = 1;
    }
}

module.exports = {
    sendEmail
};