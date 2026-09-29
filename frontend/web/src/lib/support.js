// The one support address the site publishes.
//
// It lives here rather than in site settings on purpose, and the reason is the refund
// policy: a legal document that names an address must not be able to disagree with the
// page it is printed on, and an admin editing a CMS field should not silently rewrite a
// published policy. It lived here three times over instead — once in each policy page —
// which is the same drift risk with extra steps.
//
// Currently a Gmail address, deliberately. `baytara.app` has no MX records, so every
// address at the domain bounces; a working mailbox beats a tidy-looking dead one,
// especially while a payment gateway is reviewing the site and will email it. Change this
// one line once domain mail exists.
export const SUPPORT_EMAIL = 'baytara.app1@gmail.com';
