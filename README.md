# EIRMS × Zemen-ePos Platform

<div align="center">

![NestJS](https://img.shields.io/badge/NestJS-11-red)
![React](https://img.shields.io/badge/React-19-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-336791)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748)
![Redis](https://img.shields.io/badge/Redis-Cache-red)
![BullMQ](https://img.shields.io/badge/BullMQ-Queue-orange)
![License](https://img.shields.io/badge/License-Private-lightgrey)

**Enterprise Multi-Tenant Electronic Invoicing Platform**

A centralized middleware platform that connects Merchants/POS systems with the Ethiopian Ministry of Revenue (MoR) Electronic Invoicing System.

</div>

---

# Table of Contents

- Overview
- Business Problem
- Solution
- Key Features
- System Architecture
- Technology Stack
- High Level Architecture
- Project Structure
- Backend Modules
- User Roles
- Request Flow
- Database
- Security
- Infrastructure
- Environment Variables
- Running the Project
- Production Checklist
- Future Improvements

---

# Overview

EIRMS × Zemen-ePos is an enterprise invoicing platform that allows multiple merchants to generate legally compliant electronic invoices and communicate securely with the Ministry of Revenue (MoR).

Instead of every merchant building and maintaining their own MoR integration, they integrate once with EIRMS × Zemen-ePos.

The platform becomes the middleware between:

```
Merchant POS
      │
      ▼
EIRMS × Zemen-ePos
      │
      ▼
Ministry of Revenue (MoR)
```

---

# Business Problem

Without this system every merchant would need to

- Build their own MoR integration
- Manage digital certificates
- Handle API authentication
- Maintain invoice synchronization
- Handle retries
- Manage security
- Generate compliant receipts

This becomes expensive and difficult.

---

# Solution

EIRMS × Zemen-ePos provides one centralized platform that

- manages merchants
- manages branches
- manages users
- communicates with MoR
- stores invoices
- synchronizes receipts
- handles retries
- secures credentials
- provides auditing
- generates reports

---

# Key Features

## Merchant Management

- Multi-tenant architecture
- Merchant onboarding
- Branch management
- Merchant approval
- Merchant settings

---

## User Management

- Authentication
- JWT
- Refresh Tokens
- RBAC
- Password Reset
- Account Lockout

---

## Electronic Invoice

- Sales Invoice
- Credit Note
- Debit Note
- Receipt Printing
- Invoice Draft
- Invoice History

---

## Inventory

- Products
- Categories
- Stock
- Barcode
- UPC
- Harmonization Codes

---

## Reporting

- Sales Reports
- Inventory Reports
- Tax Reports
- Scheduled Reports

---

## Audit

Every important action is logged.

Example

- Login
- Invoice Created
- Invoice Cancelled
- User Updated
- Merchant Updated

---

# Technology Stack

## Frontend

- React
- Vite
- TypeScript

---

## Backend

- NestJS
- TypeScript

---

## Database

- PostgreSQL

---

## ORM

- Prisma ORM

---

## Cache

- Redis

---

## Queue

- BullMQ

---

## Authentication

- JWT
- Refresh Tokens
- bcrypt

---

## API Documentation

- Swagger

---

## Secret Management

- HashiCorp Vault

---

## Monitoring

- Sentry

---

## Containerization

- Docker

---

# High Level Architecture

```
                        +---------------------------+
                        |     Ministry of Revenue   |
                        |      Electronic Invoice   |
                        +-------------+-------------+
                                      ^
                                      |
                               Secure REST API
                                      |
                +---------------------+----------------------+
                |                                            |
                |            EIRMS × Zemen-ePos              |
                |--------------------------------------------|
                |                                            |
                | Authentication                             |
                | Merchant Management                        |
                | Branch Management                          |
                | User Management                            |
                | Inventory                                 |
                | Invoice Management                         |
                | Reporting                                 |
                | Audit Logs                                |
                | Email Service                             |
                | Queue Processing                          |
                | Background Jobs                           |
                |                                            |
                +-----+-----------+------------+-------------+
                      |           |            |
                      |           |            |
               PostgreSQL      Redis        Vault
                      |           |            |
                 Permanent      Cache      Secrets
                   Storage      Queue      Keys
                      |
                Prisma ORM
```

---

# Project Structure

```
apps/

    api/
        src/
            auth/
            users/
            merchants/
            branches/
            invoices/
            inventory/
            reports/
            audit/
            email/
            notifications/
            health/
            prisma/

    web/
        src/
            pages/
            components/
            layouts/
            hooks/
            services/
            utils/

packages/

observability/

vault/

docker-compose.yml
```

---

# Backend Modules

## Auth

Responsible for

- Login
- Logout
- JWT
- Refresh Token
- Password Reset

---

## Users

Responsible for

- Create User
- Update User
- Lock User
- Unlock User
- Role Assignment

---

## Merchants

Responsible for

- Merchant Registration
- Merchant Approval
- Merchant Configuration

---

## Branches

Responsible for

- Branch CRUD
- Branch Certificates
- Branch Configuration

---

## Inventory

Responsible for

- Product
- Category
- Stock
- Barcode

---

## Invoice

Responsible for

- Invoice Creation
- Invoice Submission
- Invoice History
- Credit Notes
- Debit Notes

---

## Reports

Responsible for

- Daily Reports
- Sales Reports
- Inventory Reports

---

## Audit

Responsible for

- Activity Logs
- User Logs
- Security Logs

---

## Email

Responsible for

- Notifications
- Scheduled Emails
- Email Events

---

## Health

Responsible for

- Database Check
- Redis Check
- External API Check

---

# User Roles

| Role | Responsibility |
|-------|---------------|
| Super Admin | Platform Administrator |
| Merchant Admin | Manage One Merchant |
| Accountant | Financial Operations |
| Cashier | Sales & Invoice Creation |
| Support | Technical Support |

---

# Request Flow

```
Browser

   │

   ▼

React UI

   │

HTTP

   ▼

NestJS Controller

   │

Validation

   ▼

Service Layer

   │

Business Logic

   ▼

Prisma ORM

   │

PostgreSQL

   │

Response

   ▼

Frontend
```

Invoice Flow

```
Cashier

   │

Create Invoice

   │

Invoice Module

   │

Save Database

   │

Queue

   │

BullMQ

   │

MoR API

   │

Response

   │

Database Update

   │

Receipt
```

---

# Database

Main Tables

- users
- merchants
- branches
- invoices
- receipts
- inventory
- products
- categories
- audit_logs
- refresh_tokens
- reports

---

# Security

- JWT Authentication
- Refresh Tokens
- Password Hashing
- RBAC
- CORS
- Helmet
- ValidationPipe
- Swagger Authentication
- Vault Secret Management
- HTTPS Ready
- Audit Logging

---

# Infrastructure

| Component | Purpose |
|------------|----------|
| PostgreSQL | Permanent Storage |
| Prisma | ORM |
| Redis | Cache & Queue |
| BullMQ | Background Jobs |
| Vault | Secret Storage |
| Docker | Containers |
| Sentry | Monitoring |
| Swagger | API Documentation |

---

# Environment Variables

Example

```
DATABASE_URL=

REDIS_URL=

JWT_SECRET=

CORS_ORIGINS=

VAULT_ADDR=

EIRMS_BASE_URL=

EIRMS_CLIENT_ID=

EIRMS_CLIENT_SECRET=
```

---

# Running the Project

Install dependencies

```bash
pnpm install
```

Run frontend

```bash
pnpm dev:web
```

Run backend

```bash
pnpm dev:api
```

Run Prisma Migration

```bash
pnpm prisma migrate deploy
```

---

# Production Checklist

- PostgreSQL Ready
- Redis Running
- Vault Configured
- Environment Variables
- SSL Certificates
- JWT Secret
- Swagger Protection
- Sentry Enabled
- Docker Deployment
- Monitoring
- Daily Backup
- Logging
- Health Checks

---

# Future Improvements

- Kubernetes Deployment
- Horizontal Scaling
- RabbitMQ Integration
- Multi-region Deployment
- Event Streaming
- AI Fraud Detection
- Analytics Dashboard
- Mobile Application
- Payment Gateway Integration

---

# Summary

EIRMS × Zemen-ePos is an enterprise-grade, multi-tenant electronic invoicing platform that acts as a secure middleware between Merchants/POS systems and the Ethiopian Ministry of Revenue (MoR). It centralizes authentication, merchant management, invoice processing, inventory, reporting, auditing, and secure communication while providing scalability, maintainability, and production-ready infrastructure.
