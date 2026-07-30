# Coding Standards

## Language

Primary languages:

Frontend:
TypeScript

Backend:
TypeScript

Database:
SQL


---

# Backend Standards

Framework:

NestJS

Architecture:

Controller
↓
Service
↓
Repository
↓
Database


Controllers:

Only handle HTTP requests.

Never contain business logic.


Services:

Contain business rules.


Repositories:

Only database operations.


---

# Error Handling

Every API must return:

Success response:

{
 success:true,
 data:{}
}


Error:

{
 success:false,
 message:"",
 errorCode:""
}


---

# Validation

Every input must be validated.

Use:

DTO

Class Validator


Never trust user input.


---

# Logging

Every important action must create logs:

Examples:

User login

Payment

Credit usage

AI request

Admin action


---

# Documentation

Every module requires:

README.md

API documentation

Examples


---

# TypeScript Rules

Avoid:

any


Prefer:

interfaces

types

enums


---

# Comments

Write comments only when necessary.

Code should explain itself.