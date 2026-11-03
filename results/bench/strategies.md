# Filtered vector search, 2,000,000 listings

| scenario | matching rows | strategy | p50 ms | p95 ms | rows returned | recall@20 (set) | recall@20 (±0.01) | distance ratio |
|---|---|---|---|---|---|---|---|---|
| selective | 511 | prefilter_exact | 175.7 | 197 | 20 | 1 | 1 | 1 |
| selective | 511 | global_hnsw_postfilter(ef=40) | 164.1 | 197.4 | 0 | 0 | 0 | - |
| selective | 511 | planner_default(ef=40) | 168.7 | 207.3 | 20 | 1 | 1 | 1 |
| selective | 511 | portal_hnsw_iterative(ef=100) | 188 | 217.8 | 20 | 1 | 1 | 1 |
| selective | 511 | global_hnsw_iterative(ef=100) | 166.6 | 201.2 | 20 | 1 | 1 | 1 |
| medium | 135,652 | prefilter_exact | 731.7 | 835.1 | 20 | 1 | 1 | 1 |
| medium | 135,652 | global_hnsw_postfilter(ef=40) | 8 | 13.3 | 2.5 | 0.017 | 0.031 | 1.0839 |
| medium | 135,652 | planner_default(ef=40) | 603.4 | 658.8 | 20 | 1 | 1 | 1 |
| medium | 135,652 | portal_hnsw_iterative(ef=100) | 590.7 | 641.1 | 20 | 1 | 1 | 1 |
| medium | 135,652 | global_hnsw_iterative(ef=100) | 606.4 | 669.4 | 20 | 1 | 1 | 1 |
| broad | 379,998 | prefilter_exact | 2080.2 | 2285 | 20 | 1 | 1 | 1 |
| broad | 379,998 | global_hnsw_postfilter(ef=40) | 8.8 | 12.6 | 5.5 | 0.02 | 0.14 | 1.1264 |
| broad | 379,998 | planner_default(ef=40) | 7.3 | 11.4 | 20 | 0.042 | 0.18 | 1.1641 |
| broad | 379,998 | portal_hnsw_iterative(ef=100) | 8.4 | 12.3 | 20 | 0.046 | 0.204 | 1.1582 |
| broad | 379,998 | global_hnsw_iterative(ef=100) | 54.7 | 362.8 | 17.8 | 0.049 | 0.259 | 1.1962 |
| homes | 105,937 | prefilter_exact | 1463.3 | 1689.6 | 20 | 1 | 1 | 1 |
| homes | 105,937 | global_hnsw_postfilter(ef=40) | 7.2 | 10.7 | 4.7 | 0.099 | 0.179 | 1.0588 |
| homes | 105,937 | planner_default(ef=40) | 8.2 | 13.1 | 8.4 | 0.109 | 0.236 | 1.0945 |
| homes | 105,937 | portal_hnsw_iterative(ef=100) | 9.3 | 13.1 | 20 | 0.18 | 0.46 | 1.1145 |
| homes | 105,937 | global_hnsw_iterative(ef=100) | 14.6 | 480 | 16.6 | 0.172 | 0.419 | 1.1526 |
