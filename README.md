# RENTORA - Find a place you can call home.

**RENTORA** is a full-stack web application for an online house rental platform. It provides tailored experiences for Tenants, Landlords, and Administrators.

## Project Overview

This project is built using modern web development practices with a focus on UI/UX, responsive design, and robust backend architecture.

### Features

- **Role-Based Access Control**: Separate dashboards and functionalities for Tenants, Landlords, and Admins.
- **Advanced Search & Filtering**: Find properties by location, type, price, and amenities.
- **Property Management**: Landlords can list, edit, and manage their properties.
- **Rental Requests**: Tenants can send requests; landlords can approve or reject them.
- **Favorites & Reviews**: Save favorite properties and leave reviews after renting.
- **Messaging & Notifications**: Built-in chat system and notifications for seamless communication.
- **Admin Oversight**: Administrators can monitor users, properties, and overall system health.

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React, Tailwind CSS, Lucide React
- **Backend**: Next.js API Routes, Node.js
- **Database**: Prisma ORM with SQLite (can be easily migrated to PostgreSQL)
- **Authentication**: NextAuth.js with Credentials Provider (bcryptjs for password hashing)
- **Forms & Validation**: React Hook Form, Zod

## Installation & Setup

> **Note:** You must have Node.js and npm (or yarn/pnpm) installed on your system to run this project.

1. **Clone the repository / Navigate to the folder**
   ```bash
   cd rentora
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Environment Variables**
   Create a `.env` file in the root directory based on `.env.example`:
   ```env
   DATABASE_URL="file:./dev.db"
   NEXTAUTH_SECRET="your-super-secret-key-change-in-production"
   NEXTAUTH_URL="http://localhost:3000"
   ```

4. **Database Setup**
   Initialize the database and run migrations:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. **Seed Data**
   *(Optional)* Run a seed script to populate demo accounts and sample properties:
   ```bash
   npx prisma db seed
   ```

6. **Run the Development Server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

## Demo Accounts

If you use the seed script, the following demo accounts will be available:

- **Tenant**: `tenant@rentora.demo` / `password123`
- **Landlord**: `landlord@rentora.demo` / `password123`
- **Admin**: `admin@rentora.demo` / `password123`

## Project Structure

```
rentora/
├── prisma/
│   └── schema.prisma      # Database models and relations
├── src/
│   ├── app/               # Next.js App Router pages and API routes
│   │   ├── api/           # Backend endpoints
│   │   ├── dashboard/     # Role-based dashboards
│   │   ├── properties/    # Property listing and details
│   │   ├── login/         # Authentication pages
│   │   └── globals.css    # Global Tailwind styles
│   ├── components/        # Reusable React components (Navbar, Cards, etc.)
│   ├── lib/               # Utility functions, Prisma client setup
│   └── types/             # TypeScript type definitions
├── .env.example           # Example environment variables
├── tailwind.config.ts     # Tailwind CSS configuration
└── package.json           # Project dependencies and scripts
```

## Future Improvements & API Integrations

- **Maps Integration**: Integrate Google Maps or Mapbox API for the property details page.
- **Image Uploads**: Implement AWS S3 or Cloudinary for handling property image uploads.
- **Real-time Chat**: Upgrade messaging system with WebSockets (e.g., Socket.io) for real-time communication.
