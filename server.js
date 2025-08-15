// server.js
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// ---- ENV you must set ----
const MAILCHIMP_API_KEY   = '3be4f4f92518cae699df3e6d67d592ed-us19';   // e.g. 'abcd-us19...'
const MAILCHIMP_DC        = 'us19';        // e.g. 'us19'
const MAILCHIMP_LIST_ID   = 'f6a2ccd2fd';   // your "crania schools" Audience ID
const GOOGLE_WEBHOOK_KEY  = 'GoogleAdsLeadsToMailChimp';  // the key you’ll also paste in Google Ads

function getField(map, ...ids) {
  for (const id of ids) if (map[id]) return map[id];
  return '';
}

app.post('/google-ads-webhook', async (req, res) => {
  try {
    const body = req.body || {};

    // 1) Verify Google’s webhook key (Google includes it in the JSON payload)
    //    This must match exactly what you configure in the lead form’s "Webhook key".
    if (body.google_key !== GOOGLE_WEBHOOK_KEY) {
      return res.status(403).json({ ok: false, error: 'Bad key' });
    }

    // 2) Build a quick map of the submitted columns
    const map = {};
    (body.user_column_data || []).forEach(row => {
      if (row && row.column_id) map[row.column_id] = row.string_value || '';
    });

    // 3) Extract fields (Google uses column IDs like EMAIL, FIRST_NAME, LAST_NAME)
    let email = getField(map, 'EMAIL', 'EMAIL_ADDRESS');
    let first = getField(map, 'FIRST_NAME', 'GIVEN_NAME');
    let last  = getField(map, 'LAST_NAME',  'FAMILY_NAME');

    // Fallback: split FULL_NAME if FIRST/LAST not provided
    if ((!first && !last) && map.FULL_NAME) {
      const parts = map.FULL_NAME.trim().split(/\s+/);
      first = parts[0] || '';
      last  = parts.slice(1).join(' ');
    }

    // If this is a Google "Send test data" run, acknowledge but don't add to MC
    if (body.is_test) {
      return res.status(200).json({ ok: true, test: true });
    }

    if (!email) {
      // Acknowledge so Google doesn’t retry, but skip since email is required for Mailchimp
      return res.status(200).json({ ok: true, skipped: 'missing email' });
    }

    // 4) Upsert into Mailchimp as SUBSCRIBED
    const lower = email.trim().toLowerCase();
    const hash = crypto.createHash('md5').update(lower).digest('hex');
    const url  = `https://${MAILCHIMP_DC}.api.mailchimp.com/3.0/lists/${MAILCHIMP_LIST_ID}/members/${hash}`;

    const payload = {
      email_address: lower,
      status_if_new: 'subscribed',         // add new contacts as SUBSCRIBED
      merge_fields: { FNAME: first || '', LNAME: last || '' }
    };

    await axios.put(url, payload, {
      auth: { username: 'anystring', password: MAILCHIMP_API_KEY }
    });

    // Optional: add a helpful tag
    await axios.post(
      `https://${MAILCHIMP_DC}.api.mailchimp.com/3.0/lists/${MAILCHIMP_LIST_ID}/members/${hash}/tags`,
      { tags: [{ name: 'Google Ads Lead', status: 'active' }] },
      { auth: { username: 'anystring', password: MAILCHIMP_API_KEY } }
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err.response?.data || err.message);
    // Non-200 tells Google the delivery failed (so their UI shows an error).
    return res.status(500).json({ ok: false });
  }
});

app.get('/', (_, res) => res.send('OK'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Listening on', port));
