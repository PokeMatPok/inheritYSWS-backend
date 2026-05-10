import { env } from 'node:process';
import { Resend } from 'resend';

let resend: Resend | null = null;

export function initializeResend() {
    if (!env.RESEND_API_KEY) {
        console.warn('RESEND_API_KEY is not set. Email functionality will be disabled.');
        return null;
    }

    resend = new Resend(env.RESEND_API_KEY);

    console.log('Resend initialized successfully.');
    return resend;
}

export async function sendEmail(from: string, to: string[], subject: string, html: string) {
    if (!resend) {
        throw new Error('Resend is not initialized. Cannot send email.');
    }

    const { data, error } = await resend.emails.send({
    from: from,
    to: to,
    subject: subject,
    html: html,
  });

  if (error) {
    console.error({ error });
    throw new Error('Failed to send email');
  }

  return data;
}

export default resend;