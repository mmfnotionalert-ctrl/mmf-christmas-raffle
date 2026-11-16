Mae Murray Foundation Christmas Raffle 2026, the "Light up our tree" page.

index.html is the page, published on Netlify. Settings (ticket target, Stripe links) are at the top of its script.
approve.html (at /approve) is the staff page for approving the names and wishes buyers typed. It needs the APPROVE_PASSPHRASE environment variable in Netlify.
data.json holds the ticket target, paper tickets, and approved photos for photo baubles. The page reads it live from this repository.
photos/ holds approved photos for photo baubles.
netlify/functions/stripe-webhook.mjs records each paid purchase: ticket count, decoration, and the name and wish for the tree (no emails, phone numbers or payment details). netlify/functions/approve.mjs saves MMF's approvals. netlify/functions/tree.mjs tells the page the ticket count and decorations.

Changing things in data.json (no rebuild needed):
- "goal": the ticket target. The star lights when online plus paper tickets reach it.
- "paperTickets": how many paper tickets have been sold so far. Added to the online count, so they light the tree too.
- "paperDecorations": decorations for paper ticket buyers, for example {"d":"bauble_red","n":"Name to show","m":"Their wish"}. d is one of bauble_red, bauble_gold, cane, snow, gstar, robin, angel, mmf, nutcracker.
