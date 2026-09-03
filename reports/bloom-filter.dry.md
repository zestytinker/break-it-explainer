# Verification report: Bloom filters

Sources read: [Bloom (1970), Communications of the ACM](https://dl.acm.org/doi/10.1145/362686.362692), [Chromium code review](https://codereview.chromium.org/), [Apache Cassandra docs](https://cassandra.apache.org/doc/latest/cassandra/architecture/storage-engine.html), [RocksDB wiki](https://github.com/facebook/rocksdb/wiki/RocksDB-Bloom-Filter), [Maggs and Sitaraman (2015), Algorithmic Nuggets in Content Delivery](https://www.akamai.com/site/en/documents/research-paper/algorithmic-nuggets-in-content-delivery.pdf)

Claims: 13 (supported: 9, contradicted: 0, unverified: 4)

| id | verdict | claim | source | evidence |
|---|---|---|---|---|
| c1 | supported | Early versions of Chrome used a Bloom filter for Safe Browsing URL checks. | Chromium code review | "chrome bloom safe browsing"  |
| c2 | supported | Burton H. Bloom worked at Computer Usage Company in Massachusetts. | Bloom (1970), Communications of the ACM | "burton h. bloom computer"  |
| c3 | supported | Bloom's paper appeared in Communications of the ACM in 1970. | Bloom (1970), Communications of the ACM | "bloom communications acm"  |
| c4 | supported | The paper is titled Space/Time Trade-offs in Hash Coding with Allowable Errors and is five pages long. | Bloom (1970), Communications of the ACM | "the space/time trade-offs hash"  |
| c5 | supported | About 90% of words can be hyphenated by simple rules. | Bloom (1970), Communications of the ACM | "about hyphenated"  |
| c6 | supported | Roughly 50,000 words need a dictionary lookup in Bloom's example. | Bloom (1970), Communications of the ACM | "50 000 dictionary bloom"  |
| c7 | unverified | Bloom's scheme cut disk accesses by about 84%. |  |   |
| c8 | unverified | Counting Bloom filters can delete items. |  |   |
| c9 | unverified | Cuckoo filters and learned filters are later variants of the Bloom filter. |  |   |
| c10 | supported | Cassandra uses a Bloom filter per SSTable to avoid reading files that do not contain a partition. | Apache Cassandra docs | "cassandra bloom sstable"  |
| c11 | supported | RocksDB SST files can contain a Bloom filter when a filter policy is set. | RocksDB wiki | "rocksdb sst bloom"  |
| c12 | unverified | Akamai caches an object only on the second request to avoid caching one-hit wonders. |  |   |
| c13 | supported | A standard Bloom filter cannot remove an item once added. | Bloom (1970), Communications of the ACM | "a bloom"  |

## Changes applied
- c7: softened in origin.timeline[2]
- c8: softened in origin.timeline[3]
- c9: softened in origin.timeline[3]
- c12: softened in uses.items[2]

## What to do
- Skim the unverified rows. If you know a source, add its URL to `references` in concepts.json and re-run.
- Contradicted rows were cut from the page; check the surrounding sentence still reads well.
- Then set `"published": true` in concepts.json and run `npm run build`.
