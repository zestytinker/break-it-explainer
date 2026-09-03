// Excerpts from the trusted sources that were read by hand when the Bloom filter page was written.
// Used by --dry runs and tests so the verifier can be exercised offline against real source text.
module.exports = [
  { name: 'Bloom (1970), Communications of the ACM', url: 'https://dl.acm.org/doi/10.1145/362686.362692',
    text: 'Space/Time Trade-offs in Hash Coding with Allowable Errors. Burton H. Bloom, Computer Usage Company, Newton Upper Falls, Mass. Communications of the ACM, Volume 13, Number 7, July 1970, pages 422-426. ' +
      'Suppose a hyphenation program is to be written for a 500,000 word dictionary. Assume a few simple rules could properly hyphenate 90 percent of all English words, but that a dictionary lookup would be required for the other 10 percent. 450,000 of these words can be hyphenated by application of a few simple rules. The other 50,000 words require reference to a dictionary. ' +
      'With an allowable error rate of 1/16 the number of disk accesses is reduced to about 16 percent, a reduction of 84 percent in the number of disk accesses. ' +
      'Method 2: If all d bits are 1, the new message is accepted. If any of these bits is zero, the message is rejected. This reduction in hash area size may make the difference between maintaining the hash area in core or having to put it on a slow access bulk storage device such as a disk.' },
  { name: 'Chromium code review', url: 'https://codereview.chromium.org/',
    text: 'Transition safe browsing from bloom filter to prefix set. chrome/browser/safe_browsing/bloom_filter.cc. Historically, web browsers, including Google Chrome, used a Bloom filter to store a set of malicious URLs.' },
  { name: 'Apache Cassandra docs', url: 'https://cassandra.apache.org/doc/latest/cassandra/architecture/storage-engine.html',
    text: 'To avoid checking every SSTable data file for the partition being requested, Cassandra employs a data structure known as a bloom filter. Bloom filters are a probabilistic data structure that allows Cassandra to determine one of two possible states: the data definitely does not exist in the given file, or the data probably exists in the given file.' },
  { name: 'RocksDB wiki', url: 'https://github.com/facebook/rocksdb/wiki/RocksDB-Bloom-Filter',
    text: 'In RocksDB, when the filter policy is set, every newly created SST file will contain a Bloom filter, which is used to determine if the file may contain the key we are looking for.' },
  { name: 'Maggs and Sitaraman (2015), Algorithmic Nuggets in Content Delivery', url: 'https://www.akamai.com/site/en/documents/research-paper/algorithmic-nuggets-in-content-delivery.pdf',
    text: 'A cache-on-second-hit rule: if an object has not been seen before, the object is fetched and served to the client, but it is not cached. Bloom filters are used to implement this rule. Nearly three-quarters of the objects accessed are one-hit wonders.' }
];
