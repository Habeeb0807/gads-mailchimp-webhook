import crypto from "crypto";
import axios from "axios";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // --- Configuration ---
  const MAILCHIMP_API_KEY = "3be4f4f92518cae699df3e6d67d592ed-us19";
  const MAILCHIMP_DC = "us19";
  const MAILCHIMP_LIST_ID = "f6a2ccd2fd";
  const GOOGLE_WEBHOOK_KEY = "mySecretKey123"; // choose your secret

  const body = req.body;

  if (body.google_key !== GOOGLE_WEBHOOK_KEY) {
    return res.status(403).json({ ok: false, error: "Bad key" });
  }

  const map = {};
  (body.user_column_data || []).forEach(row => {
    if (row && row.column_id) map[row.column_id] = row.string_value || "";
  });

  let email = map.EMAIL || map.EMAIL_ADDRESS || "";
  let first = map.FIRST_NAME || map.GIVEN_NAME || "";
  let last = map.LAST_NAME || map.FAMILY_NAME || "";

  if (!email) return res.status(200).json({ ok: true, skipped: "missing email" });

  const lower = email.trim().toLowerCase();
  const hash = crypto.createHash("md5").update(lower).digest("hex");
  const url = `https://${MAILCHIMP_DC}.api.mailchimp.com/3.0/lists/${MAILCHIMP_LIST_ID}/members/${hash}`;

  try {
    await axios.put(
      url,
      {
        email_address: lower,
        status_if_new: "subscribed",
        merge_fields: { FNAME: first || "", LNAME: last || "" }
      },
      {
        auth: { username: "anystring", password: MAILCHIMP_API_KEY }
      }
    );

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ ok: false });
  }
}
