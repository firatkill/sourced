# MongoDB manual golden set: review notes

Reviewer decisions for `eval/mongodb-manual/golden.jsonl` (D-127: the owner delegated candidate review). Candidates came from one live `sourced eval:generate --count 45` run on 2026-11-11 (53 candidates, $0.0087) after the D-128 slug fix. Accepted answerable questions keep the candidate's reference answer; when the expected section exists in several language or distribution variants of the same page (`?language-no-dependencies=…`, `?linux-distro=…`), all variants are listed as expected anchors. Unanswerable candidates were checked against the 200 ingested pages with full-text searches before acceptance.

## Accepted

- Candidate 0: accepted. "How can you enable authorization in MongoDB, and what must users do afterward?" (1 anchor)
- Candidate 3: accepted. "What steps does MongoDB take after receiving a query, and what should you examine to improve its performance?" (1 anchor)
- Candidate 4: accepted. "Which additional features does MongoDB Enterprise include for subscribers?" (1 anchor)
- Candidate 5: accepted. "Which methods can you use to run an aggregation pipeline?" (1 anchor)
- Candidate 8: accepted. "Which options are required when configuring CSFLE through autoEncryptionOpts?" (7 anchors, including language or distribution variants of the same section)
- Candidate 9: accepted. "Which operation types are supported by bulk write operations?" (1 anchor)
- Candidate 11: accepted. "What readahead setting is recommended for WiredTiger database devices?" (1 anchor)
- Candidate 12: accepted. "Why can cold shards increase change stream response time in a sharded cluster?" (1 anchor)
- Candidate 13: accepted. "Which method should you use to manually decrypt encrypted fields with explicit encryption?" (7 anchors, including language or distribution variants of the same section)
- Candidate 14: accepted. "Which three directors have the highest movie counts in the sample pipeline results, and how many movies did each direct?" (1 anchor)
- Candidate 15: accepted. "Which packages are installed by the mongodb-org-database metapackage?" (1 anchor)
- Candidate 17: accepted. "How does MongoDB replication keep writes available when the primary server becomes unavailable?" (1 anchor)
- Candidate 22: accepted. "What must be removed to completely uninstall a package-manager installation of MongoDB on Linux?" (6 anchors, including language or distribution variants of the same section)
- Candidate 23: accepted. "Which cluster roles should the config server and shard mongod instances use?" (1 anchor)
- Candidate 24: accepted. "Why should you consider a TTL index instead of creating a capped collection?" (1 anchor)
- Candidate 26: accepted. "How can an application request a document’s pre-image and post-image in a change stream?" (15 anchors, including language or distribution variants of the same section)
- Candidate 28: accepted. "How do you combine the test client certificate and private key, and how can you use the resulting file with mongosh?" (1 anchor)
- Candidate 29: accepted. "Which serverStatus fields can help identify whether lock contention is affecting MongoDB performance?" (1 anchor)
- Candidate 33: accepted. "How does rewrapManyDataKey determine which data keys to rotate and which CMK to use?" (7 anchors, including language or distribution variants of the same section)
- Candidate 36: accepted. "Which Windows groups must a non-administrator running mongod or mongos join for FTDC to collect system data?" (1 anchor)
- Candidate 38: accepted. "How can you change the maximum number of documents in a capped collection, and when are excess documents removed?" (1 anchor)
- Candidate 39: accepted. "What can cause the fullDocument field to be missing from an update event?" (15 anchors, including language or distribution variants of the same section)
- Candidate 40: accepted. "Which Azure credentials should you record when registering your application, and what are they used for?" (6 anchors, including language or distribution variants of the same section)
- Candidate 41: accepted. "Which command converts a non-capped collection, and what happens to other operations during the conversion?" (1 anchor)
- Candidate 42: accepted. "Which deployment types have instructions for upgrading from MongoDB Community Edition to Enterprise Edition?" (1 anchor)
- Candidate 43: accepted. "Which operation categories can the auditing system record, and what setting is required for CRUD events?" (1 anchor)
- Candidate 45: accepted as unanswerable. "How can I estimate the monthly operating cost of a self-managed MongoDB deployment across different cloud providers?" No passage in the 200 pages covers it.
- Candidate 47: accepted as unanswerable. "What benchmark results compare MongoDB aggregation performance with PostgreSQL analytics workloads on equivalent hardware?" No passage in the 200 pages covers it.
- Handwritten unanswerable (q029): "How do I expose a MongoDB collection through a GraphQL API?" No passage mentions GraphQL.
- Handwritten unanswerable (q030): "Which MongoDB certification exam should a developer take first?" No passage mentions certification exams or MongoDB University.

## Rejected

- Candidate 0: "Where can you find more information about CSFLE components, encryption keys, and KMS providers?" Reason: not selected.
- Candidate 1: "What should you select to view the installation steps for libmongocrypt?" Reason: navigation (asks which pages exist).
- Candidate 2: "What kinds of operations can self-managed replica set member configuration tutorials help support?" Reason: not answerable as a fact (tells the user to select an option).
- Candidate 3: "What document structure does the example assume you want to insert into MongoDB?" Reason: not selected.
- Candidate 4: "What should you do before starting this process, and what does it remove?" Reason: not selected.
- Candidate 5: "What topics are listed for further information about MongoDB Community Edition on Linux?" Reason: not selected.
- Candidate 6: "Which deployment types have separate instructions for upgrading MongoDB Community to Enterprise?" Reason: navigation.
- Candidate 7: "Which Enterprise deployment types have upgrade tutorials from Community Edition?" Reason: depends on context ("the example").
- Candidate 8: "What two outcomes should you have after completing this AWS CSFLE guide?" Reason: not selected.
- Candidate 9: "Which resources explain how CSFLE works and how to create a production-ready setup with a remote KMS?" Reason: not selected.
- Candidate 10: "Which topics are listed in the MongoDB manual’s topic guide?" Reason: depends on context ("this process").
- Candidate 11: "What should you do to install and configure a CSFLE query analysis component?" Reason: not selected.
- Candidate 12: "What should you select to view the installation steps for libmongocrypt?" Reason: not selected.
- Candidate 13: "What does this tutorial teach, and what production risk does its example application pose?" Reason: not selected.
- Candidate 14: "Which Enterprise upgrade guides are listed for different MongoDB deployment types?" Reason: not selected.
- Candidate 15: "Which pages provide more information about CSFLE components, encryption keys, and KMS providers?" Reason: not selected.
- Candidate 16: "What do these documents provide instructions for?" Reason: navigation.
- Candidate 17: "What must you do before using CSFLE in your development environment?" Reason: not selected.
- Candidate 18: "Which documentation pages cover creating and managing capped collections?" Reason: duplicate of 42.
- Candidate 19: "Which MongoDB server versions remain supported for security fixes, and what are their exact end-of-life dates?" Reason: duplicate of 42.
- Candidate 20: "How should I design a disaster recovery plan with specific recovery time and recovery point objectives?" Reason: depends on context ("this guide").
- Candidate 21: "Which third-party observability platforms provide the most reliable MongoDB alerting integrations and pricing?" Reason: navigation (lists resources).
- Candidate 22: "What are the recommended procedures for migrating a production MongoDB cluster to another cloud provider without downtime?" Reason: not selected.
- Candidate 23: "How do MongoDB licensing terms apply when embedding the server in a commercial software product?" Reason: not selected.
- Candidate 24: "Which MongoDB configuration best suits a workload with measured document sizes, query rates, and latency targets?" Reason: not selected.

## Result

26 answerable and 4 unanswerable questions; the four built-in injection questions are added at eval time. The first eval (`results/2026-11-11.md`) met every default floor. Chat and judge are the same model (`gpt-6-luna`, judge defaulting to chat), and the same model generated the candidates, so faithfulness may be optimistic; a different judge model would give a stricter reading.
