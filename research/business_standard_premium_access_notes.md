# Business Standard premium-access assessment notes

## Supplied article

- Short link: `https://mybs.in/2g8XPnM`
- Resolved article: `https://www.business-standard.com/finance/news/debit-card-rule-may-act-as-template-to-shield-upi-users-from-mdr-fee-126082100962_1.html`
- The article page identifies the story as premium and exposes the headline, image, summary, and at least an introductory portion to a public browser session.
- A fresh public-response inspection exposed three short body paragraphs before the page’s subscription offer. That is more text than whitemint’s current reader displayed, so the current generic extraction may be under-extracting this specific page structure.
- The response itself still labels the story `premium` and terminates with subscription offers. The observed delivery behavior does not change the publisher’s stated subscription and automated-access restrictions.

## Official subscription findings

- Business Standard describes its digital subscription as access to behind-the-paywall content and certain exclusive features.
- Its terms state that registration is for a single user; account IDs must not be shared or used for multi-user/network access.
- Its terms prohibit accessing content without authorization and prohibit automated collection or scraping without prior written consent.
- The official contact page directs digital-subscription access problems to `assist@bsmail.in` and asks subscribers to try signing out and signing back in if payment has succeeded but access does not work.

## Implication for whitemint

whitemint can preserve publicly available preview text from the fetched page. It cannot legitimately bypass Business Standard paywall controls, transfer app-session credentials, or scrape an authenticated subscription session into its own local reader without a publisher-authorized integration or explicit permission. An official API, OAuth-like authorization, licensed feed, or publisher-approved web session flow would be needed for full premium content.

## Sources

1. Business Standard premium page: `https://premium.business-standard.com/`
2. Business Standard terms: `https://www.business-standard.com/terms-conditions`
3. Business Standard contact/support: `https://www.business-standard.com/contact-us`
