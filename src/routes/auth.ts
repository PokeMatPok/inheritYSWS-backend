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

function sendWelcome(id: "string", firstName: string) {
    sendMessageToSlack(id, `${firstName}! Welcome to Inherit! :tada:`, [
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

authRouter.get('/oauth', (req, res) => {
    const OauthCode = req.query.code as string;

    console.log('Received OAuth code:', OauthCode);

    fetch('https://auth.hackclub.com/oauth/token', {
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
    }).then((response: Response) => response.json())
        .then((data) => {
            console.log('Received OAuth token response:', data);
            const accessToken = data.access_token;
            if (!accessToken) {
                console.error('No access token received from Hack Club OAuth:', data);
                return res.status(500).json({ error: 'Failed to authenticate with Hack Club.' });
            }

            fetch('https://auth.hackclub.com/api/v1/me', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }).then((response: Response) => response.json())
                .then((userData) => {
                    console.log('Received user data from Hack Club:', userData);

                    // write to db if not exists
                    db.query('SELECT * FROM users WHERE openid = $1', [userData.id])
                        .then((result) => {
                            if (result.rows.length === 0) {
                                userData = userData.identity;
                                // User doesn't exist, create a new one
                                db.query('INSERT INTO users (openid, first_name, last_name, primary_email, slack_id, role) VALUES ($1, $2, $3, $4, $5, $6)', [
                                    userData.id,
                                    userData.first_name,
                                    userData.last_name,
                                    userData.primary_email,
                                    userData.slack_id,
                                    "user"
                                ]).catch((err) => {
                                    console.error('Error creating user in database:', err);
                                    return res.status(500).json({ error: 'Failed to create user in database.' });
                                });

                                try {
                                    sendWelcome(userData.slack_id, userData.first_name);

                                    db.query('UPDATE users SET slack_welcome_sent = TRUE WHERE openid = $1', [userData.id])
                                        .catch((err) => {
                                            console.error('Error updating slack_welcome_sent in database:', err);
                                        });
                                } catch (err) {
                                    console.error('Error sending welcome message:', err);
                                }
                            }

                            const userPayload: UserPayload = {
                                id: result.rows.length > 0 ? result.rows[0].id : -1, // You might want to fetch the ID of the newly created user here
                                username: userData.first_name + ' ' + userData.last_name,
                                email: userData.primary_email,
                                role: 'user' // Default role, you can modify this as needed
                            };

                            res.cookie('token', generateToken(userPayload), { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
                            return res.redirect((process.env.FRONTEND_URL || 'http://localhost:5173') + '/home');
                        })
                        .catch((err) => {
                            console.error('Error checking user in database:', err);
                            return res.status(500).json({ error: 'Failed to check user in database.' });
                        });
                }).catch((err) => {
                    console.error('Error fetching user data from Hack Club:', err);
                    return res.status(500).json({ error: 'Failed to fetch user data from Hack Club.' });
                });
        });
});

export default authRouter;