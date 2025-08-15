// api/webhook.js
import crypto from 'crypto';
import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const MAILCHIMP_API_KEY   = '3be4f4f92518cae699df3e6d67d592ed-us19';   // e.g. 'abcd-us19...'
    const MAILCHIMP_DC        = 'us19';        // e.g. 'us19'
    const MAILCHIMP_LIST_ID   = 'f6a2ccd2fd';   // your "crania schools" Audience ID
     const GOOGLE_WEBHOOK_KEY  = 'GoogleAdsLeadsToMailChimp';  

    const body = req.body || {};

    // Verify Google webhook key
    if (body.google_key !== GOOGLE_WEBHOOK_KEY) {
      return res.status(403).json({ ok: false, error: 'Bad key' });
    }

    const map = {};
    (body.user_column_data || []).forEach(row => {
      if (row && row.column_id) map[row.column_id] = row.string_value || '';
    });

    let email = map.EMAIL || map.EMAIL_ADDRESS || '';
    let first = map.FIRST_NAME || map.GIVEN_NAME || '';
    let last  = map.LAST_NAME || map.FAMILY_NAME || '';

    if ((!first && !last) && map.FULL_NAME) {
      const parts = map.FULL_NAME.trim().split(/\s+/);
      first = parts[0] || '';
      last  = parts.slice(1).join(' ');
    }

    if (body.is_test) {
      return res.status(200).json({ ok: true, test: true });
    }

    if (!email) {
      return res.status(200).json({ ok: true, skipped: 'missing email' });
    }

    const lower = email.trim().toLowerCase();
    const hash = crypto.createHash('md5').update(lower).digest('hex');
    const url  = `https://${MAILCHIMP_DC}.api.mailchimp.com/3.0/lists/${MAILCHIMP_LIST_ID}/members/${hash}`;

    const payload = {
      email_address: lower,
      status_if_new: 'subscribed',
      merge_fields: { FNAME: first || '', LNAME: last || '' }
    };

    await axios.put(url, payload, {
      auth: { username: 'anystring', password: MAILCHIMP_API_KEY }
    });

    await axios.post(
      `https://${MAILCHIMP_DC}.api.mailchimp.com/3.0/lists/${MAILCHIMP_LIST_ID}/members/${hash}/tags`,
      { tags: [{ name: 'Google Ads Lead', status: 'active' }] },
      { auth: { username: 'anystring', password: MAILCHIMP_API_KEY } }
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err.response?.data || err.message);
    return res.status(500).json({ ok: false });
  }
}
