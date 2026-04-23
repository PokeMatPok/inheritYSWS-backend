import express from 'express';
import { authenticate, AuthenticatedRequest, generateToken, UserPayload } from '../middleware/auth';
import { db } from '../db';
import cors from 'cors';
import { sendMessageToSlack } from '../slack/init';

const corsConfig = {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true
}

const authRouter = express.Router();

async function sendWelcome(id: string, firstName: string) {
    await sendMessageToSlack(id, `${firstName}! Welcome to Inherit! :tada:`, [
        {
            "type": "image",
            "image_url": "https://raw.githubusercontent.com/PokeMatPok/inheritYSWS-backend/main/assets/welcome_slack_orpheus.png",
            "alt_text": "desk dino"
        },
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": `Hey ${firstName}! Welcome to Inherit :dino:`,
                "emoji": true
            },
            "level": 1
        },
        {
            "type": "rich_text",
            "elements": [
                {
                    "type": "rich_text_section",
                    "elements": [
                        {
                            "type": "text",
                            "text": " Here's the deal: you pick an abandoned project, claim it, set a prize goal, then make it awesome again. We track your hours with Hackatime, you submit a PR, get it reviewed by peers, and when it merges—boom, your prize ships. It's open source with actual rewards for bringing dead code back to life. Check the help page if you need details, or dive into browsing projects and see what catches your eye!"
                        }
                    ]
                }
            ]
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": "Continue picking your project with the button at the right"
            },
            "accessory": {
                "type": "button",
                "text": {
                    "type": "plain_text",
                    "text": ":arrow:\t Claim your project!",
                    "emoji": true
                },
                "value": "click_me_123",
                "url": "https://google.com",
                "action_id": "button-action"
            }
        }
    ]);
}

authRouter.get('/check', cors(corsConfig), (req, res, next) => {
    authenticate(req, res, next, (_) => {
        return res.status(200).json({ authenticated: false });
    });
}, (req, res) => {
    return res.status(200).json({ authenticated: true, user: (req as AuthenticatedRequest).user });
});

authRouter.get('/login', (req, res, next) => {
    authenticate(req, res, next, (message) => {
        const base_oauth = `https://auth.hackclub.com/oauth/authorize?client_id=${process.env.HACKCLUB_OAUTH_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.HACKCLUB_OAUTH_REDIRECT_URI ?? "")}&response_type=code&scope=openid+email+name+profile+verification_status+slack_id`;
        const email = req.query.email as string;

        if (!email) {
            return res.status(401).redirect(base_oauth);
        } else {
            return res.status(401).redirect(base_oauth + `&login_hint=${encodeURIComponent(email)}`);
        }
    });
}, (req, res) => {
    res.redirect((process.env.FRONTEND_URL || 'http://localhost:5173') + '/home');
});

authRouter.get('/oauth', async (req, res) => {
    const OauthCode = req.query.code as string;

    console.log('Received OAuth code:', OauthCode);

    try {
        const tokenResponse: Response = await fetch('https://auth.hackclub.com/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                "client_id": process.env.HACKCLUB_OAUTH_CLIENT_ID,
                "client_secret": process.env.HACKCLUB_OAUTH_CLIENT_SECRET,
                "redirect_uri": process.env.HACKCLUB_OAUTH_REDIRECT_URI,
                "code": OauthCode,
                "grant_type": "authorization_code"
            })
        });

        const data = await tokenResponse.json();

        console.log('Received OAuth token response:', data);
        const accessToken = data.access_token;
        if (!accessToken) {
            console.error('No access token received from Hack Club OAuth:', data);
            return res.status(500).json({ error: 'Internal Server Error. Further information not available.' });
        }

        try {
            const userResponse: Response = await fetch('https://auth.hackclub.com/api/v1/me', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            const userData = await userResponse.json();

            const identity = userData.identity || {};

            //console.log('Received user data from Hack Club:', userData);
            // dev only ^

            // write to db if not exists
            try {
                const result = await db.query('SELECT * FROM users WHERE openid = $1', [identity.id]);

                if (result.rows.length === 0) {

                    // User doesn't exist, create a new one
                    await db.query('INSERT INTO users (openid, first_name, last_name, primary_email, slack_id) VALUES ($1, $2, $3, $4, $5)', [
                        identity.id,
                        identity.first_name,
                        identity.last_name,
                        identity.primary_email,
                        identity.slack_id
                    ]);

                    try {
                        //slightly slower because of serial, but then the users will surely get their message :yay:
                        await sendWelcome(identity.slack_id, identity.first_name);
                        await db.query('UPDATE users SET slack_welcome_sent = TRUE WHERE openid = $1', [identity.id])
                    } catch (err) {
                        console.error('Error sending welcome message:', err);
                    };
                } else if (!result.rows[0].slack_welcome_sent) {
                    try {
                        await sendWelcome(identity.slack_id, identity.first_name);
                        await db.query('UPDATE users SET slack_welcome_sent = TRUE WHERE openid = $1', [identity.id])
                    } catch (err) {
                        console.error('Error sending welcome message:', err);
                    };
                }

                const inserted = await db.query('SELECT * FROM users WHERE openid = $1', [identity.id]);

                const userPayload: UserPayload = {
                    id: inserted.rows.length > 0 ? inserted.rows[0].id : -1, // You might want to fetch the ID of the newly created user here
                    username: identity.first_name + ' ' + identity.last_name,
                    email: identity.primary_email,
                    role: 'user' // Default role, you can modify this as needed
                };

                res.cookie('token', generateToken(userPayload), { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
                return res.redirect((process.env.FRONTEND_URL || 'http://localhost:5173') + '/home');
            } catch (err) {
                console.error('Error checking user in database:', err);
                return res.status(500).json({ error: 'Internal Server Error. Further information not available.' });
            }
        } catch (err) {
            console.error('Error fetching user data from Hack Club:', err);
            return res.status(500).json({ error: 'Internal Server Error. Further information not available.' });
        }
    } catch (err) {
        console.error('Error fetching OAuth token:', err);
        return res.status(500).json({ error: 'Internal Server Error. Further information not available.' });
    }
});

export default authRouter;