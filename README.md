Here is the corrected README.md content in a raw code block. You can copy the entire block below and paste it directly into your README.md file.

Markdown

# Volt Backend (Server)

[![Live Server](https://img.shields.io/badge/Live_Server-Render-46E3B7?style=for-the-badge&logo=render&logoColor=white)](https://volt-backend-e0ls.onrender.com/)

The backend infrastructure for **Volt**, handling user authentication, rental logic, wallet transactions, and admin management. Built with **NestJS**, it ensures secure and scalable communication between the mobile app, web dashboard, and the database.

## 🔗 Base URL
**Live API:** `https://volt-backend-e0ls.onrender.com/`  

## 🚀 Features
- **Authentication:** Firebase Admin integration for secure user management.
- **Rental Logic:** Complex state management for renting and returning "Volts" (units).
- **Wallet System:** Integration with **PayMongo** for top-ups and transaction tracking.
- **Email Notifications:** Automated emails using **Nodemailer** (Gmail SMTP).
- **Admin Dashboard:** specialized endpoints for system administration and settings.
- **Data Management:** CSV parsing for student data bulk imports.

## 🛠 Tech Stack
- **Framework:** [NestJS](https://nestjs.com/) (Node.js)
- **Language:** TypeScript
- **Database / Auth:** Firebase Admin SDK
- **Payments:** PayMongo
- **Email Service:** Nodemailer
- **Environment:** Dotenv

## 📂 Project Directory

```text
volt-backend/
├── src/
│   ├── admin/             # Admin controls & settings
│   ├── auth/              # Firebase authentication guards
│   ├── rent/              # Rental business logic
│   ├── return/            # Return flow logic
│   ├── students/          # Student data & CSV handling
│   ├── transactions/      # Payment & wallet history
│   ├── users/             # User profile management
│   ├── volts/             # Powerbank unit management
│   ├── wallet/            # Wallet balance & PayMongo integration
│   ├── app.module.ts      # Main application module
│   └── main.ts            # Entry point & CORS config
├── test/                  # E2E Testing
├── .env                   # Environment variables
├── package.json           # Dependencies
└── tsconfig.json          # TypeScript config

⚡ Getting Started
PrerequisitesNode.js (Latest LTS)
Firebase Service Account (google-services.json or admin SDK credentials)

Installation
Clone the repository and install dependencies:Bashgit clone <repository-url>
cd volt-backend
npm install

Environment VariablesCreate a .env file in the root directory and add the following:Code snippetPORT=3000
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
FIREBASE_PROJECT_ID=your-project-id
PAYMONGO_SECRET_KEY=your-paymongo-key
Running the ServerBash# Development
npm run start

# Watch mode
npm run start:dev

# Production build
npm run build
npm run start:prod

📡 API Endpoints (Overview)
ModuleMethodEndpointDescriptionAuth
POST/auth/loginAuthenticate user via FirebaseWallet
POST/wallet/rechargeTop up wallet balanceRent
POST/rent/startInitiate a rental sessionReturn
POST/return/confirmComplete a return flowAdmin
GET/admin/stats(Admin) View system usage

☁️ DeploymentThis project is configured for Render (implied by process.env.PORT)
.Connect your GitHub repository to Render
.Set the Build Command to: npm install && npm run buildSet the Start Command to: npm run start:prod
.Add your Environment Variables in the Render dashboard.

📄 LicenseThis project is licensed under the ISC License.