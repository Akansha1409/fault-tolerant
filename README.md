# 🛡️ Fault-Tolerant Data Processing System

![Status](https://img.shields.io/badge/Status-Completed-success)
![Node.js](https://img.shields.io/badge/Node.js-v18+-green?logo=node.js)
![React](https://img.shields.io/badge/Frontend-React_Vite-blue?logo=react)
![SQLite](https://img.shields.io/badge/Database-SQLite-003B57?logo=sqlite)

A robust, full-stack data ingestion system designed to handle unreliable data from external clients. This system normalizes incoming JSON events, deduplicates them using content-addressable hashing, and provides consistent aggregated analytics even in the face of partial system failures.

---

## 🏗️ System Architecture

[Image of Fault tolerant system architecture diagram showing client, ingestion API, normalization, deduplication, SQLite DB, and Frontend]

The system follows a layered architecture to ensure separation of concerns:

```mermaid
graph LR
    Client[External Client] -->|Raw JSON| API[Ingestion API]
    API -->|Hash & Check| Cache{Idempotency Check}
    Cache -->|Duplicate| Response[200 OK]
    Cache -->|New Event| Norm[Normalization Layer]
    Norm -->|Clean Data| DB[(SQLite Database)]
    DB -->|Aggregated Data| Frontend[React Dashboard]
