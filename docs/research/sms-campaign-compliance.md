# SMS Outreach Campaign Compliance — Hard Constraints

**Date:** 2026-07-15
**Scope:** US-focused automated multi-step SMS outreach campaigns to scraped business leads, sent via a Twilio Messaging Service (A2P 10DLC long codes).
**Purpose:** Enforceable rules the campaign scheduler and message-content pipeline MUST encode, with primary-source citations. "MUST" = legal or carrier-contract requirement; "SHOULD" = strongly indicated by enforcement/litigation posture.

---

## 1. TCPA consent (B2B cold SMS)

**R1.1 — Treat every recipient cell number as TCPA-protected, including business numbers.**
47 U.S.C. § 227(b) / 47 CFR § 64.1200(a)(1)(iii) restricts autodialed/artificial-voice calls (and texts — the FCC treats texts as "calls") to *any telephone number assigned to a cellular telephone service*, with **no exemption for business-owned cell phones**. Scraped "business" phone numbers are very often mobile numbers (sole proprietors, tradespeople — exactly this product's lead base). The system MUST NOT assume "B2B" removes TCPA exposure.
Citations: https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200 ; https://www.fdic.gov/consumer-compliance-examination-manual/viii-5-telephone-consumer-protection-act

**R1.2 — Marketing texts sent by an automated platform require prior express written consent (PEWC).**
47 CFR § 64.1200(a)(2): telemarketing/advertising messages to wireless numbers using an ATDS or prerecorded/artificial voice require prior express **written** consent — a signed writing (E-SIGN ok) that names the seller, authorizes marketing texts, and is not a condition of purchase (§ 64.1200(f)(9)). Consent for calls/email does NOT carry over to SMS. The product MUST NOT auto-send marketing SMS to a lead for which the user has not recorded PEWC.
Citations: https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200

**R1.3 — The FCC one-to-one consent rule is dead; baseline PEWC still governs.**
The Eleventh Circuit vacated the FCC's one-to-one consent rule on 2025-01-24 (*Insurance Marketing Coalition v. FCC*, No. 24-10277) as exceeding FCC authority; the FCC subsequently deleted the vacated language and reinstated the prior PEWC rules. Do NOT build one-to-one-consent logic; DO build standard PEWC capture/storage.
Citations: https://law.justia.com/cases/federal/appellate-courts/ca11/24-10277/24-10277-2025-01-24.html ; https://www.womblebonddickinson.com/us/insights/blogs/fcc-repeals-one-one-consent-rule-following-eleventh-circuit-decision

**R1.4 — Do-not-call rules add a second, independent violation per text.**
47 CFR § 64.1200(c)(2): telephone solicitations to numbers on the national DNC registry (wireless numbers are presumptively covered) are actionable after more than one message in 12 months (47 U.S.C. § 227(c)(5)). A multi-step cold campaign (2+ texts) to a DNC-listed number is per se exposure. The scheduler SHOULD support DNC scrubbing or cap unsolicited sequences at risk-acknowledged settings.
Citations: https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200 ; https://woodlaw.com/articles/federal-court-rules-text-messages-violate-tcpa-do-not-call/

**R1.5 — Exposure math: $500–$1,500 per text, uncapped, no actual harm required.**
47 U.S.C. § 227(b)(3) and § 227(c)(5): $500 statutory damages per violating text, trebled to $1,500 for willful/knowing violations; §(b) and §(c) violations can stack on the same message. A 1,000-lead × 3-message cold campaign is a theoretical $1.5M–$9M class exposure.
Citations: https://www.law.cornell.edu/uscode/text/47/227 ; https://www.rothjackson.com/blog/2025/02/reminder-that-statutory-damages-for-a-dnc-violation-should-not-start-at-500-per-call-or-text/

**R1.6 — Required product consent posture.**
Because scraped leads by definition have given no consent, the product MUST: (a) require the account owner to attest a lawful consent basis before any SMS campaign is activated; (b) store per-lead consent provenance (source, timestamp, consent text) — Twilio requires proof of consent on demand (see R2.5); (c) default new/scraped/imported leads to `sms_consent = NONE` and refuse automated marketing sends to them. Cold-first-touch SMS to scraped numbers cannot be made compliant by product design alone (see Open Questions).

---

## 2. A2P 10DLC registration and carrier content rules

**R2.1 — Brand + campaign registration is mandatory before any US 10DLC sending.**
Since 2023-07-05, all SMS/MMS to US numbers from 10DLC numbers must be sent via a registered A2P campaign (Brand registered with The Campaign Registry, then a Campaign with a declared use case, opt-in/opt-out description, and sample messages, linked to a Messaging Service with ≥1 number in its sender pool). Unregistered traffic is blocked by Twilio and heavily filtered/surcharged by carriers (e.g. AT&T: $0.01/SMS unregistered vs $0.002 registered).
Citations: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc ; https://help.twilio.com/articles/14910496447771 ; https://help.twilio.com/articles/4410588996123-A2P-10DLC-Carrier-Penalties-for-Non-Compliant-Messaging

**R2.2 — Campaign use case must truthfully be "Marketing" (or Low-Volume Mixed) and describe the opt-in flow.**
Campaign vetting requires a 40–4096-char description of who the sender is, who recipients are, why they receive messages, and *how they opted in*. A campaign describing "cold outreach to scraped leads" will be rejected in vetting (error 30883, Content Violation); a campaign that lies about opt-in is grounds for suspension. The product MUST surface campaign-registration status per Messaging Service and refuse to send on unregistered/rejected campaigns.
Citations: https://www.twilio.com/docs/trust-hub/registrations/a2p-10dlc-campaign ; https://help.twilio.com/articles/11847054539547-A2P-10DLC-Campaign-Approval-Requirements ; https://www.twilio.com/docs/api/errors/30883

**R2.3 — Purchased/rented/scraped lists are categorically disallowed by CTIA and carriers.**
CTIA Messaging Principles and Best Practices (May 2023): message senders "should not use opt-in lists that have been rented, sold, or shared" — senders must create and vet their own opt-in lists, and consent for other channels does not transfer to SMS. Carriers enforce these principles as a condition of A2P network access. This is independent of, and stricter than, the TCPA.
Citations: https://api.ctia.org/wp-content/uploads/2023/05/230523-CTIA-Messaging-Principles-and-Best-Practices-FINAL.pdf

**R2.4 — Twilio's Messaging Policy independently prohibits unsolicited bulk messaging and consent transfer.**
Twilio's Acceptable Use / Messaging Policy: prior express consent is required for every recipient; "you buy, sell, rent, or transfer consent" is prohibited; "sending any unsolicited or unwanted messages in bulk" is prohibited; consent is subject-matter-specific; snowshoeing (spreading traffic across numbers to evade filtering) is prohibited. Violations risk account suspension — a platform-level risk for the CRM, not just its users.
Citations: https://www.twilio.com/en-us/legal/messaging-policy

**R2.5 — Consent records MUST be retained and producible.**
Twilio Messaging Policy: "You are required to retain proof of all consents obtained from recipients" and provide it on request. The data model MUST store consent artifacts per lead per channel.
Citations: https://www.twilio.com/en-us/legal/messaging-policy

**R2.6 — Content filter: SHAFT and prohibited categories.**
SHAFT content (Sex, Hate, Alcohol, Firearms, Tobacco/vape) plus cannabis/CBD is forbidden or heavily restricted on US long codes/toll-free/short codes regardless of consent; other forbidden categories include high-risk financial services, debt relief, gambling (state-restricted), and deceptive/phishing content. AI-generated message copy MUST be screened against these categories, and public URL shorteners (bit.ly etc.) SHOULD be avoided (filtering trigger).
Citations: https://help.twilio.com/articles/360045004974-Forbidden-Message-Categories-in-the-US-and-Canada-Short-Code-Toll-Free-and-Long-Code ; https://www.twilio.com/en-us/guidelines/us/sms

---

## 3. Quiet hours (scheduler time gating)

**R3.1 — Federal floor: no telephone solicitation before 8:00 or after 21:00 recipient local time.**
47 CFR § 64.1200(c)(1). Applies to texts. Note: a wave of "quiet hours" TCPA suits (480+ cases/demands as of late 2025) targets texts sent outside this window even to arguably-consented recipients; the EIA petition asking the FCC to confirm PEWC covers quiet hours is still pending (see Open Questions). The scheduler MUST hard-gate all sends to 08:00–21:00 recipient local time, with stricter state windows below.
Citations: https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200 ; https://www.privacyworld.blog/2025/03/fcc-seeks-comment-on-quiet-hours-and-marketing-text-messages/

**R3.2 — Florida (FTSA, Fla. Stat. §§ 501.059, 501.616): 08:00–20:00 AND max 3 messages per 24h on the same subject matter.**
"Telephonic sales call" explicitly includes text messages. Private right of action, $500–$1,500 per message. Sending number must be answerable/callable (no non-connecting sender numbers). Scheduler rules for FL recipients: MUST NOT send outside 08:00–20:00 local; MUST NOT exceed 3 campaign messages to one person per rolling 24h on the same subject.
Citations: https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0500-0599%2F0501%2FSections%2F0501.616.html ; https://www.flsenate.gov/laws/statutes/2021/501.059

**R3.3 — Oklahoma (Telephone Solicitation Act, HB 3168): 08:00–20:00, max 3 per 24h same subject** — mirrors the FTSA, with private right of action.
Citations: https://mslawgroup.com/u-s-telemarketing-laws/ (tracker; statute: 15 O.S. § 775C.1 et seq.)

**R3.4 — Texas (SB 140, effective 2025-09-01): 09:00–21:00 Mon–Sat, 12:00–21:00 Sunday; texts now covered; private right of action up to $5,000/violation.**
SB 140 broadened Tex. Bus. & Com. Code ch. 302/305 "telephone solicitation" to include text and image messages. Scheduler rules for TX: no sends before 09:00 or after 21:00; no Sunday sends before noon.
Citations: https://www.kaufmandolowich.com/news-resources/law-alert-state-mini-tcpa-laws-growing-texas-latest-to-update-its-telemarketing-rules-8-21-2025-by-richard-j-perr-monica-m-littman-graeme-e-hogan-dominic-borelli-and-kristen-ruotolo/

**R3.5 — Connecticut (SB 1058, effective 2023-10-01): 09:00–20:00, PEWC required for ALL telephonic sales calls including texts; penalties up to $20,000 per violation.**
Citations: https://www.manatt.com/insights/newsletters/tcpa-connect/connecticut-senate-bill-1058 ; https://mslawgroup.com/ct-amends-telemarketing-law/

**R3.6 — Washington (CEMA, RCW 19.190.060): unsolicited commercial text messages to WA residents are banned outright — no quiet-hour cure.**
Only affirmative advance consent (or existing carrier-subscriber relationship) permits commercial texts. Statutory damages $500/message (reduced to $100 for actions commenced on/after 2026-06-11 by HB 2274, signed 2026-03-23), plus WA Consumer Protection Act exposure. Scheduler rule: MUST NOT send any marketing SMS to a Washington recipient without recorded consent — period.
Citations: https://app.leg.wa.gov/rcw/default.aspx?cite=19.190.060 ; https://www.seyfarth.com/news-insights/an-amendment-to-washingtons-commercial-electronic-mail-act-cema.html

**R3.7 — Maryland ("Stop the Spam Calls Act", SB 90): PEWC for solicitations + max 3 per 24h; enforcement under MD Consumer Protection Act.** New Jersey: 08:00–21:00.
Citations: https://mslawgroup.com/u-s-telemarketing-laws/ ; https://www.leadfriendly.com/guides/tcpa-calling-hours-by-state

**R3.8 — Recipient local time determination.**
No federal rule fixes the method; plaintiffs sue on where the recipient actually is, and area code is an unreliable proxy (number portability). Scheduler MUST derive candidate time zones from BOTH the number's area code AND the lead's known address/state, and send only when the current time is inside the allowed window for **all** candidate zones (most-restrictive-wins). If neither is known, apply the most restrictive continental-US interpretation. State-law selection (FL/TX/etc. windows and frequency caps) MUST likewise key off both area code state and address state, applying the stricter of the two.
Citations: https://www.infolawgroup.com/insights/2025/3/26/do-you-need-to-stop-sending-texts-at-nightearly-morning ; https://activeprospect.com/blog/tcpa-calling-hours/

---

## 4. Opt-out handling

**R4.1 — First message of every campaign MUST include opt-out instructions ("Reply STOP to unsubscribe" or equivalent), plus sender identification.**
Twilio Messaging Policy and CTIA best practices require clear opt-out language in the initial message of a recurring program and periodic reminders thereafter; every message SHOULD identify the sender. Content templates MUST inject sender name + STOP language into message 1 of every sequence; safest posture is STOP language on every message.
Citations: https://www.twilio.com/en-us/legal/messaging-policy ; https://api.ctia.org/wp-content/uploads/2023/05/230523-CTIA-Messaging-Principles-and-Best-Practices-FINAL.pdf

**R4.2 — Honor revocation made by ANY reasonable method, not just keywords.**
47 CFR § 64.1200(a)(10) (FCC 24-24, effective 2025-04-11): consent revoked by any reasonable means is definitively revoked. FCC-named presumptively-reasonable keywords: STOP, QUIT, END, REVOKE, OPT OUT, CANCEL, UNSUBSCRIBE (case-insensitive; also treat free-form replies like "stop texting me" as revocation). The inbound handler MUST parse beyond exact keywords, and non-keyword replies expressing refusal MUST suppress the lead.
Citations: https://docs.fcc.gov/public/attachments/FCC-24-24A1.pdf ; https://www.bclplaw.com/en-US/events-insights-news/the-tcpas-new-opt-out-rules-take-effect-on-april-11-2025-what-does-this-mean-for-businesses.html

**R4.3 — Revocation MUST take effect within 10 business days; the product SHOULD make it immediate.**
The rule sets "as soon as practicable, not to exceed 10 business days." Implementation: on STOP, immediately set lead opt-out flag, cancel all queued/scheduled campaign steps for that lead, and block future enqueues. Note: the portion of the rule extending one revocation to ALL robocalls/robotexts from the sender (scope of revocation) was waived/delayed to 2026-04-11 and is now in effect as of this writing — an opt-out from one campaign MUST suppress the lead across all campaigns from that organization.
Citations: https://docs.fcc.gov/public/attachments/DA-25-312A1.pdf ; https://www.nixonpeabody.com/insights/alerts/2025/04/11/fcc-partially-delays-new-tcpa-consent-revocation-rules

**R4.4 — Exactly one confirmation message is permitted after opt-out; nothing else.**
FCC rule and Twilio policy allow a single opt-out confirmation text (no marketing content; sent promptly — FCC guidance: within 5 minutes); after that, zero messages. Use Twilio Messaging Service **Advanced Opt-Out** so STOP/START/HELP are handled at the Twilio layer as a backstop, but keep the CRM's own suppression list authoritative (Twilio's opt-out is per-Messaging-Service; the CRM must suppress org-wide).
Citations: https://docs.fcc.gov/public/attachments/FCC-24-24A1.pdf ; https://www.twilio.com/en-us/legal/messaging-policy

**R4.5 — Suppression list is permanent and survives list re-imports.**
Re-scraping/re-importing a lead MUST NOT clear its opt-out state. Dedupe imports against the suppression list by normalized phone number.
Citations: 47 CFR § 64.1200(a)(10) (revoked consent may not be overridden by sender action) — https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200

---

## 5. Throughput limits (scheduler pacing)

**R5.1 — Throughput is set by carrier, per brand tier / trust score — not by Twilio account size.**
Standard brands get a TCR Trust Score (0–100) at registration/secondary vetting; it determines carrier throughput. Sole Proprietor and Low-Volume Standard brands get fixed low limits.
Citations: https://help.twilio.com/articles/1260803225669-Message-throughput-MPS-and-Trust-Scores-for-A2P-10DLC-in-the-US

**R5.2 — AT&T: per-campaign rate limit by message class (TPM = SMS segments/minute).**
Standard campaigns: score 75–100 → 4,500 TPM (~75 MPS); 50–74 → 2,400 TPM; 1–49 → 240 TPM. Low-Volume Mixed → 75 TPM (~1.25 MPS). Sole Proprietor → 15 TPM. The scheduler MUST rate-limit per campaign, not just per number.
Citations: https://developers.telnyx.com/docs/messaging/10dlc/10dlc-rate-limits ; https://help.twilio.com/articles/1260803225669-Message-throughput-MPS-and-Trust-Scores-for-A2P-10DLC-in-the-US

**R5.3 — T-Mobile: hard DAILY cap per BRAND (shared across all campaigns/numbers): score 75–100 → 200,000 segments/day; 50–74 → 40,000; 25–49 → 10,000; 1–24 → 2,000; Sole Proprietor ≈ 1,000/day (Twilio docs cite ~3,000/day across carriers for Sole Prop; Low-Volume Standard ~6,000).**
Exceeding the cap fails messages for the rest of the day. The scheduler MUST track a per-org daily segment budget (segments, not messages — a 300-char message is 2+ segments) and stop before the cap.
Citations: https://developers.telnyx.com/docs/messaging/10dlc/10dlc-rate-limits ; https://www.twilio.com/docs/messaging/compliance/a2p-10dlc

**R5.4 — Verizon: no published rate table; content-quality filtering instead.** High complaint/opt-out rates cause silent filtering. Monitor delivery error codes (30007 filtering) per campaign.
Citations: https://developers.telnyx.com/docs/messaging/10dlc/10dlc-rate-limits

**R5.5 — Alternatives: toll-free defaults to 3 MPS (verification required; higher on request); short codes give high throughput (~100+ MPS) but require dedicated lease and carrier approval — neither exempts you from consent rules.**
Citations: https://help.twilio.com/articles/1260803225669-Message-throughput-MPS-and-Trust-Scores-for-A2P-10DLC-in-the-US

**R5.6 — Messaging Service queue behavior: Twilio queues over-rate submissions per number/service; default queue TTL / validity period is 10 hours (raised from 4h, completed May 2025); messages still queued at TTL expiry fail (error 30001 queue overflow).**
Implications for the scheduler: (a) do not dump an entire campaign into Twilio — enqueue at a pace ≤ campaign MPS so quiet-hour boundaries aren't crossed by Twilio's own queue drain (a message queued at 19:50 for an FL lead could deliver at 21:30); set an explicit `ValidityPeriod` short enough that late delivery cannot cross the recipient's quiet-hour window; (b) native message scheduling requires a MessagingServiceSid and is limited to ≤35 days ahead.
Citations: https://www.twilio.com/en-us/changelog/extension-of-configurable-queue-ttl-validity-period ; https://help.twilio.com/articles/115002943027-Understanding-Twilio-Rate-Limits-and-Message-Queues ; https://www.twilio.com/docs/api/errors/30001 ; https://help.twilio.com/articles/4412165297947-Message-Scheduling-FAQs-and-Beta-Limitations

---

## Open legal questions / product-posture risks

1. **Cold SMS to scraped leads is not a compliance-tuning problem — it is disallowed at the carrier layer.** Even if a given send could be defended under the TCPA (e.g. human-initiated, non-ATDS after *Facebook v. Duguid* narrowed the autodialer definition), CTIA principles and Twilio's Messaging Policy flatly prohibit messaging without recipient opt-in and prohibit purchased/scraped lists (R2.3, R2.4). **A "cold SMS blast to scraped leads" feature as such cannot ship compliantly over Twilio.** Realistic product postures: (a) SMS only to leads with recorded opt-in (e.g. captured via demo-site form, inbound text, or prior business relationship documented by the user); (b) SMS as a reply channel only; (c) mandatory per-campaign attestation + consent-provenance field, with unconsented leads hard-excluded from SMS steps.
2. **Quiet hours vs. consented messages (EIA petition).** Whether PEWC immunizes senders for texts delivered inside 21:00–08:00 is pending before the FCC (comment cycle closed 2025; no ruling found as of 2026-07-15). Hundreds of quiet-hours suits/demands are active. Posture: gate all sends to the window regardless of consent. https://www.troutman.com/insights/fcc-seeks-comments-on-petition-to-address-tcpa-quiet-hours/
3. **ATDS status of the campaign engine.** An automated multi-step scheduler that stores numbers and sends without human intervention is exactly what plaintiffs plead as an ATDS/"automated system"; several state mini-TCPAs (FL, OK, MD, CT) use broader "automated system" definitions than the federal ATDS. Assume the product is an autodialer for compliance purposes.
4. **"Recipient location" is legally fuzzy.** Area code ≠ location (portability); address ≠ current location. Most-restrictive-wins scheduling (R3.8) is a mitigation, not a safe harbor.
5. **State-law drift.** The mini-TCPA landscape is moving fast (TX added texts 2025-09; WA damages amended 2026-03; more states annually). The quiet-hours/frequency rule table should be data, not code, and reviewed at least quarterly. Tracker: https://mslawgroup.com/u-s-telemarketing-laws/
6. **Platform liability.** The CRM (not only its users) faces Twilio account termination and potential secondary TCPA liability ("initiating" or substantially involved in sending) if it ships defaults that generate unconsented traffic. Compliance rails must be enforced server-side, not presented as user-overridable suggestions.
