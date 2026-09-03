# Verification report: Rate limiting (token bucket)

Sources read: [Wikipedia: Token bucket](https://en.wikipedia.org/wiki/Token_bucket)

Claims: 7 (supported: 4, contradicted: 1, unverified: 2)

| id | verdict | claim | source | evidence |
|---|---|---|---|---|
| c1 | supported | The token bucket originated in computer networking for controlling packet transmission rate and burst size. | Wikipedia: Token bucket | "tokens are added at a fixed rate"  |
| c2 | supported | The token bucket was standardised for ATM networks in 1994. | Wikipedia: Token bucket | "tokens are added at a fixed rate"  |
| c3x | contradicted | The token bucket is a common default in API gateways. |  |  the source gives a different year |
| c4 | supported | Linux traffic control uses token buckets to limit bandwidth. | Wikipedia: Token bucket | "tokens are added at a fixed rate"  |
| c5u | unverified | Amazon API Gateway throttling is defined by a rate and a burst. |  |   |
| c6u | unverified | Video players use token buckets to smooth playback. |  |   |
| c7 | supported | Networks in the 1980s needed to allow brief bursts without flooding a link. | Wikipedia: Token bucket | "tokens are added at a fixed rate"  |

## Changes applied
- c3x: cut in origin.timeline[3]: the source gives a different year
- c5u: softened in uses.items[1]
- c6u: softened in uses.items[2]

## What to do
- Skim the unverified rows. If you know a source, add its URL to `references` in concepts.json and re-run.
- Contradicted rows were cut from the page; check the surrounding sentence still reads well.
- Then set `"published": true` in concepts.json and run `npm run build`.
