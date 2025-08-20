# Hacelerix User Seeding Script

This script creates comprehensive mock data for the invoice management platform specifically for the user with email `info@hacelerix.com`.

## What it creates

### 🧱 **Materials (20 items)**
- **Cemento y Morteros**: Portland cement, predosed mortar, refractory mortar
- **Estructuras Metálicas**: Corrugated steel bars (Ø12mm, Ø16mm), IPE beams, electrowelded mesh
- **Áridos y Granulados**: Washed river sand, gravel (20-40mm), small gravel (4-12mm)
- **Maquinaria**: Hydraulic excavators, mini-excavators, front loaders, vibratory compactors
- **Encofrados y Andamios**: Multidirectional scaffolding, metal formwork, telescopic props
- **Additional Materials**: Concrete blocks, perforated bricks, PVC pipes

### 🏗️ **Providers (9 companies)**
- **Material Suppliers (5)**:
  - Cementos Lafarge España SL (Madrid)
  - Hierros y Aceros del Norte SA (Bizkaia)
  - Áridos García y Hermanos SL (Sevilla)
  - Materiales de Construcción Valencia SL (Valencia)
  - Prefabricados Catalanes SA (Barcelona)

- **Machinery Rental (4)**:
  - Maquinaria Pesada Ibérica SL (Madrid)
  - Alquileres Mediterráneo SL (Alicante)
  - Excavaciones y Alquileres Galicia SL (A Coruña)
  - Alquiler de Andamios Profesionales SL (Zaragoza)

### 📄 **Invoices & Items**
- **54-72 invoices** total (6-8 per provider)
- **2-5 items per invoice** with realistic quantities
- Spread across **12 months** (Feb 2024 - Jan 2025)
- Realistic Spanish **work orders** (OT) for construction projects
- **Material-provider relationships** based on realistic supply chains

### 🚨 **Price Alerts**
- Automatic alerts for **significant price increases** (>15%)
- **Historical price tracking** with realistic market fluctuations
- Mixed status (pending/approved) for realism

### 📊 **Additional Features**
- **Product groups** for better material organization
- **Batch processing history** to simulate upload activity
- **Provider aliases** support for CIF management
- **Work order tracking** for project cost analysis
- Realistic **Spanish CIF numbers** and addresses

## Usage

### Run the seeding script:
```bash
npm run seed:hacelerix
```

### The script will:
1. Find or create the user `info@hacelerix.com`
2. Clean any existing data for this user
3. Create all mock data associated with the user
4. Display a summary of created records

### Output example:
```
✅ Hacelerix user seeding completed successfully!
Created data for user: info@hacelerix.com
- Product Groups: 5
- Materials: 20
- Providers: 9
- Total Invoices: 67
- Work Orders: 16
```

## Realistic Data Features

### **Price Realism**
- Cement: €145.50/TN
- Steel bars: €0.76-0.78/KG
- Sand/Gravel: €28.50-35.00/M3
- Excavator rental: €180-420/day
- Scaffolding: €8.50/M2

### **Spanish Construction Context**
- Real Spanish company names and locations
- Valid CIF number formats
- Actual construction project types
- Regional distribution across Spain
- Industry-standard material codes

### **Temporal Distribution**
- Invoices spread realistically across seasons
- Price variations reflecting market conditions
- Recent data for current analysis
- Historical trends for comparison

## Database Relations

The script respects all database constraints and creates proper relationships:
- Materials ↔ Providers (with last prices)
- Invoices → Provider + Items
- Items → Materials (with work orders)
- Price Alerts → Materials + Providers + Invoices
- All entities → User (info@hacelerix.com)

## Development Notes

- Uses realistic Spanish construction industry data
- Follows actual material classification standards
- Implements proper price variation algorithms
- Creates meaningful work order patterns
- Maintains referential integrity
- Supports both material supply and machinery rental business models
