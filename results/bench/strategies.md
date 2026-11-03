# Filtered vector search, 2,000,000 listings

| scenario | matching rows | strategy | p50 ms | p95 ms | rows returned | recall@20 |
|---|---|---|---|---|---|---|
| selective | 511 | prefilter_exact | 154.3 | 184.2 | 20 | 1 |
| selective | 511 | global_hnsw_postfilter(ef=40) | 169 | 201.3 | 0 | 0 |
| selective | 511 | planner_default(ef=40) | 134 | 181.3 | 20 | 1 |
| selective | 511 | portal_hnsw_iterative(ef=100) | 155.5 | 191.9 | 20 | 1 |
| selective | 511 | global_hnsw_iterative(ef=100) | 154.5 | 178 | 20 | 1 |
| medium | 135,652 | prefilter_exact | 683.3 | 799.1 | 20 | 1 |
| medium | 135,652 | global_hnsw_postfilter(ef=40) | 11.7 | 18.9 | 2.5 | 0.017 |
| medium | 135,652 | planner_default(ef=40) | 542.8 | 578.1 | 20 | 1 |
| medium | 135,652 | portal_hnsw_iterative(ef=100) | 551.8 | 618.4 | 20 | 1 |
| medium | 135,652 | global_hnsw_iterative(ef=100) | 565.2 | 614.3 | 20 | 1 |
| broad | 379,998 | prefilter_exact | 1922.2 | 2150.3 | 20 | 1 |
| broad | 379,998 | global_hnsw_postfilter(ef=40) | 8.3 | 11.7 | 5.5 | 0.02 |
| broad | 379,998 | planner_default(ef=40) | 37.1 | 95 | 20 | 0.042 |
| broad | 379,998 | portal_hnsw_iterative(ef=100) | 16.1 | 49.5 | 20 | 0.046 |
| broad | 379,998 | global_hnsw_iterative(ef=100) | 53.2 | 334.1 | 17.8 | 0.049 |
| homes | 105,937 | prefilter_exact | 1354.9 | 1510.3 | 20 | 1 |
| homes | 105,937 | global_hnsw_postfilter(ef=40) | 7.1 | 11.1 | 4.7 | 0.099 |
| homes | 105,937 | planner_default(ef=40) | 75.2 | 106.3 | 8.4 | 0.109 |
| homes | 105,937 | portal_hnsw_iterative(ef=100) | 35.2 | 76.1 | 20 | 0.18 |
| homes | 105,937 | global_hnsw_iterative(ef=100) | 11.9 | 434.9 | 16.6 | 0.172 |
