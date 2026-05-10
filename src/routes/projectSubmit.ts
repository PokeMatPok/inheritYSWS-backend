import express from 'express';
import { authenticate, AuthenticatedRequest, generateToken, UserPayload } from '../middleware/auth';
import { db } from '../db';
import { sendMessageToSlack } from '../services/slack';
import crypto from 'crypto';
import { sendEmail } from '../services/resend';

const projectSubmissionRouter = express.Router();

async function sendVerificationMessage(id: string, name: string, verificationLink: string) {
    await sendMessageToSlack(id, `Hey ${name}, let's get you verified!`, [
        {
            "type": "image",
            "image_url": "https://raw.githubusercontent.com/PokeMatPok/inheritYSWS/main/static/banner.png",
            "alt_text": "desk dino"
        },
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": `Hey ${name}, we greatly appreciate your interest in submitting a project to Inherit!`,
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
                            "text": "I think you would be a great fit for our program, but before we can proceed with your project submission, we need to verify your identity to ensure the safety and integrity of our community. This is a standard procedure that helps us maintain a secure and trustworthy environment for all our members. Also this helps us contact you when anything is wrong :)"
                        }
                    ]
                }
            ]
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": "Verify your identity by clicking the button below:"
            },
            "accessory": {
                "type": "button",
                "text": {
                    "type": "plain_text",
                    "text": "Verify Me",
                    "emoji": true
                },
                "value": "user_verification",
                "url": verificationLink,
                "action_id": "button-action"
            }
        }
    ]);
}

function sendVerificationEmail(email: string, token: string) {
    const verificationLink = `https://inherit.dino.icu/verify?token=${token}`;
    const emailContent = `<div style="background-color:#c8a87a;color:#3b1f0e;font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 32px;border-radius:12px;text-align:center;border:3px solid #8b5e3c"><img src="https://inherit.dino.icu/inherit-logo.svg" alt="Inherit logo" width="200"/><h1 style="color:#3b1f0e;font-size:28px;font-weight:900;margin:24px 0 8px">One last step!</h1><p style="color:#5a3010;font-size:13px;font-weight:700;letter-spacing:.05em;margin:0 0 24px">Rethink · Rebuild · Reship</p><hr style="border:none;border-top:2px solid #8b5e3c;margin:0 0 24px"/><p style="color:#3b1f0e;font-size:16px;line-height:1.7;text-align:left;margin:0 0 24px">Hey there! Before you can submit your project to <strong>Inherit</strong>, please verify your email address by clicking the button below.</p><a href="${verificationLink}" style="display:inline-block;padding:14px 32px;background-color:#8b5e3c;color:#fff;text-decoration:none;border-radius:999px;font-size:16px;font-weight:700">✓ Verify My Email</a><hr style="border:none;border-top:2px solid #8b5e3c;margin:24px 0"/><p style="color:#5a3010;font-size:13px;margin:0">If you didn't sign up for Inherit, you can safely ignore this, someone probably made a mistake.</p><a href="https://hackclub.com"><img src="https://assets.hackclub.com/flag-orpheus-top.svg" alt="Hack Club" width="90" style="margin-top:24px"/></a></div>`;

    sendEmail("Inherit <noreply@inherit.dino.icu>", [email], "Verify your Inherit email", emailContent);
}

function generateVerificationToken() {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return { token, tokenHash, tokenExpiresAt };
}

projectSubmissionRouter.post('/submit', (req, res, next) => {
    authenticate(req, res, next, () => {
        next();
    });
}, async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const isLoggedIn = !!authReq.user;

    const data: {
        name: string;
        projectName: string;
        description: string;
        url: string;
        notGithub: boolean;
        programmingLanguage: string;
        improvementPotential: string;
        difficulty: number;
        contactMethod: 'hackclub' | 'email' | 'slack';
        contactInfo: string;
    } = authReq.body;

    if (isLoggedIn && authReq.user && data.contactMethod === 'hackclub') {
        const user = authReq.user;

        const contributorResult = await db.query(`
            INSERT INTO project_contributors (openid, display_name, verified_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (openid) DO UPDATE SET display_name = EXCLUDED.display_name
            RETURNING id;`,
            [String(user.openid), data.name]
        );
        const contributorId = contributorResult.rows[0].id;

        await db.query(`
            INSERT INTO project_contributions (contributor_id, title, description, github_url, improvement_areas, languages_used, difficulty_rating)
            VALUES ($1, $2, $3, $4, $5, $6, $7);`,
            [contributorId, data.projectName, data.description, data.url, data.improvementPotential, data.programmingLanguage, data.difficulty]
        );

        return res.sendStatus(200);
    }

    if (!isLoggedIn && data.contactMethod === 'email') {
        const { token, tokenHash, tokenExpiresAt } = generateVerificationToken();

        const contributorResult = await db.query(`
            INSERT INTO project_contributors (email, display_name, verification_token_hash, verification_token_expires_at)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (email) DO UPDATE SET
                display_name = EXCLUDED.display_name,
                verification_token_hash = EXCLUDED.verification_token_hash,
                verification_token_expires_at = EXCLUDED.verification_token_expires_at,
                verified_at = NULL
            RETURNING id;`,
            [data.contactInfo, data.name, tokenHash, tokenExpiresAt]
        );
        const contributorId = contributorResult.rows[0].id;

        await db.query(`
            INSERT INTO project_contributions (contributor_id, title, description, github_url, improvement_areas, languages_used, difficulty_rating)
            VALUES ($1, $2, $3, $4, $5, $6, $7);`,
            [contributorId, data.projectName, data.description, data.url, data.improvementPotential, data.programmingLanguage, data.difficulty]
        );

        sendVerificationEmail(data.contactInfo, token);

        return res.sendStatus(200);
    }

    if (!isLoggedIn && data.contactMethod === 'slack') {
        const { token, tokenHash, tokenExpiresAt } = generateVerificationToken();

        const contributorResult = await db.query(`
            INSERT INTO project_contributors (slack_id, display_name, verification_token_hash, verification_token_expires_at)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (slack_id) DO UPDATE SET
                display_name = EXCLUDED.display_name,
                verification_token_hash = EXCLUDED.verification_token_hash,
                verification_token_expires_at = EXCLUDED.verification_token_expires_at,
                verified_at = NULL
            RETURNING id;`,
            [data.contactInfo, data.name, tokenHash, tokenExpiresAt]
        );
        const contributorId = contributorResult.rows[0].id;

        await db.query(`
            INSERT INTO project_contributions (contributor_id, title, description, github_url, improvement_areas, languages_used, difficulty_rating)
            VALUES ($1, $2, $3, $4, $5, $6, $7);`,
            [contributorId, data.projectName, data.description, data.url, data.improvementPotential, data.programmingLanguage, data.difficulty]
        );

        sendVerificationMessage(data.contactInfo, data.name, `https://inherit.dino.icu/verify?token=${token}`);

        return res.sendStatus(200);
    }

    return res.status(400).json({ error: 'Invalid contact method or missing user information' });
});

projectSubmissionRouter.post('/verify', async (req, res) => {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid token' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const result = await db.query(`
        SELECT id, verification_token_expires_at
        FROM project_contributors
        WHERE verification_token_hash = $1
          AND verified_at IS NULL;`,
        [tokenHash]
    );

    if (result.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid or already used token' });
    }

    const contributor = result.rows[0];

    if (new Date(contributor.verification_token_expires_at) < new Date()) {
        return res.status(400).json({ error: 'Token has expired' });
    }

    await db.query(`
        UPDATE project_contributors
        SET verified_at = NOW(),
            verification_token_hash = NULL,
            verification_token_expires_at = NULL
        WHERE id = $1;`,
        [contributor.id]
    );

    return res.sendStatus(200);
});

export default projectSubmissionRouter;