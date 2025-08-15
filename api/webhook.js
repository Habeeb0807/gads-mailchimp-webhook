import crypto from "crypto";
import axios from "axios";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const MAILCHIMP_API_KEY = "3be4f4f92518cae699df3e6d67d592ed-us19";
  const MAILCHIMP_DC = "us19";
  const MAILCHIMP_LIST_ID = "f6a2ccd2fd";
  const GOOGLE_WEBHOOK_KEY = "mySecretKey123"; // your secret

  const body = req.body;

  // --- Validate webhook key ---
  if (body.google_key !== GOOGLE_WEBHOOK_KEY) {
    return res.status(403).json({ success: false, error: "Bad key" });
  }

  // --- Respond immediately to Google Ads ---
  res.status(200).json({ success: true });

  // --- Process Mailchimp asynchronously ---
  try {
    const map = {};
    (body.user_column_data || []).forEach(row => {
      if (row && row.column_id) map[row.column_id] = row.string_value || "";
    });

    const email = map.EMAIL || map.EMAIL_ADDRESS || "";
    const first = map.FIRST_NAME || map.GIVEN_NAME || "";
    const last = map.LAST_NAME || map.FAMILY_NAME || "";

    if (!email) return;

    const lower = email.trim().toLowerCase();
    const hash = crypto.createHash("md5").update(lower).digest("hex");

    const url = `https://${MAILCHIMP_DC}.api.mailchimp.com/3.0/lists/${MAILCHIMP_LIST_ID}/members/${hash}`;

    // --- Add/Update subscriber with tag ---
    await axios.put(
      url,
      {
        email_address: lower,
        status_if_new: "subscribed",
        merge_fields: { FNAME: first || "", LNAME: last || "" },
        tags: ["GOOGLE_ADS_LEADS"]
      },
      {
        auth: { username: "anystring", password: MAILCHIMP_API_KEY }
      }
    );

    console.log("Mailchimp: subscriber added/updated with tag GOOGLE_ADS_LEADS");
  } catch (err) {
    console.error("Mailchimp error:", err.response?.data || err.message);
  }
}
