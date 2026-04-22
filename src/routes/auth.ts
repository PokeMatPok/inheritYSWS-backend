import express from 'express';
import { authenticate, generateToken, UserPayload } from '../middleware/auth';
import { db } from '../db';

const authRouter = express.Router();

authRouter.post('/login', (req, res) => {
    const { username, password } = req.body;

    db.query('SELECT * FROM users WHERE username = $1', [username])

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
                                userData  = userData.identity;
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
                            }

                            const userPayload: UserPayload = {
                                id: result.rows.length > 0 ? result.rows[0].id : -1, // You might want to fetch the ID of the newly created user here
                                username: userData.first_name + ' ' + userData.last_name,
                                email: userData.primary_email,
                                role: 'user' // Default role, you can modify this as needed
                            };

                            res.cookie('token', generateToken(userPayload), { httpOnly: true, secure: process.env.NODE_ENV === 'production' });
                            return res.json({ message: 'Authentication successful', user: userPayload });
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