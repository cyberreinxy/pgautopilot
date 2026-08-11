-- =============================================================================
-- NorthStar Dynamics — Enterprise Demo Database
-- File:    001_initial_schema.sql
-- Purpose: Production-quality schema for demonstrating a PostgreSQL database
--          management application against a realistic B2B software/services
--          company (NorthStar Dynamics, northstardynamics.demo).
-- Target:  PostgreSQL 15+
--
-- Contents:
--   0. Idempotent teardown (safe to re-run against a non-empty database)
--   1. Utility trigger function (updated_at maintenance)
--   2. Tables (10)
--        organizations, departments, roles, users, customers,
--        products, projects, orders, invoices, activity_logs
--   3. Deferred / circular foreign keys (departments.head_user_id)
--   4. Indexes
--   5. Triggers
--   6. Table & column comments
--
-- Note on UUIDs: gen_random_uuid() has been built into PostgreSQL core since
-- version 13, so no extension (e.g. pgcrypto) is required to generate
-- RFC 4122-compliant version-4 UUIDs on the PostgreSQL 15+ target.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. IDEMPOTENT TEARDOWN
-- -----------------------------------------------------------------------------
-- Drops are ordered child-to-parent and CASCADE so this file can be re-run
-- safely against a database that already has these objects, not only a
-- blank one.
DROP TABLE IF EXISTS activity_logs CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS departments CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;
DROP FUNCTION IF EXISTS set_updated_at() CASCADE;

-- -----------------------------------------------------------------------------
-- 1. UTILITY TRIGGER FUNCTION
-- -----------------------------------------------------------------------------
-- Generic trigger function that stamps updated_at with the current timestamp
-- on every UPDATE. Attached to every table that carries an updated_at column.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION set_updated_at() IS
    'Sets NEW.updated_at = now() before any UPDATE. Attached via per-table triggers.';

-- =============================================================================
-- 3. TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 3.1 organizations
-- Top-level legal/business entities: NorthStar Dynamics HQ plus its regional
-- subsidiaries and business units. Departments, users, customer accounts and
-- projects are all scoped to an owning organization.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    legal_name          TEXT,
    industry            TEXT NOT NULL DEFAULT 'Enterprise Software & Business Services',
    website             TEXT,
    email               TEXT,
    phone               TEXT,
    address_line1       TEXT,
    address_line2       TEXT,
    city                TEXT,
    state_province      TEXT,
    postal_code         TEXT,
    country             TEXT,
    tax_id              TEXT,
    status              TEXT NOT NULL DEFAULT 'active',
    description         TEXT,
    notes               TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    CONSTRAINT organizations_status_check
        CHECK (status IN ('active', 'inactive', 'archived')),
    CONSTRAINT organizations_website_format_check
        CHECK (website IS NULL OR website ~* '^[a-z0-9.-]+\.[a-z]{2,}$')
);

-- -----------------------------------------------------------------------------
-- 3.2 departments
-- Organizational sub-units (Engineering, Sales, Finance, etc.) belonging to
-- an organization. head_user_id is added later via ALTER TABLE once the
-- users table exists (departments <-> users is a circular relationship).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS departments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
    name                TEXT NOT NULL,
    code                VARCHAR(20) NOT NULL,
    cost_center         VARCHAR(20),
    description         TEXT,
    status              TEXT NOT NULL DEFAULT 'active',
    notes               TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    CONSTRAINT departments_status_check
        CHECK (status IN ('active', 'inactive', 'archived')),
    CONSTRAINT departments_org_code_unique
        UNIQUE (organization_id, code)
);

-- -----------------------------------------------------------------------------
-- 3.3 roles
-- Job/permission roles assignable to users. Shared catalog across all
-- organizations (not organization-scoped) so titles stay consistent
-- company-wide.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    code                VARCHAR(30) NOT NULL,
    description         TEXT,
    department_category TEXT,
    permission_level    INTEGER NOT NULL DEFAULT 1,
    is_system_role      BOOLEAN NOT NULL DEFAULT FALSE,
    status              TEXT NOT NULL DEFAULT 'active',
    metadata            JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT roles_name_unique UNIQUE (name),
    CONSTRAINT roles_code_unique UNIQUE (code),
    CONSTRAINT roles_status_check
        CHECK (status IN ('active', 'inactive')),
    CONSTRAINT roles_permission_level_check
        CHECK (permission_level BETWEEN 1 AND 10)
);

-- -----------------------------------------------------------------------------
-- 3.4 users
-- Internal NorthStar Dynamics employees/system users.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
    department_id       UUID REFERENCES departments(id) ON DELETE SET NULL ON UPDATE CASCADE,
    role_id             UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    first_name          TEXT NOT NULL,
    last_name           TEXT NOT NULL,
    email               VARCHAR(255) NOT NULL,
    phone               TEXT,
    job_title           TEXT,
    hire_date           DATE,
    termination_date    DATE,
    status              TEXT NOT NULL DEFAULT 'active',
    is_admin            BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at       TIMESTAMPTZ,
    password_changed_at TIMESTAMPTZ,
    notes               TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    CONSTRAINT users_email_unique UNIQUE (email),
    CONSTRAINT users_email_domain_check
        CHECK (email ~* '^[a-z0-9._%+-]+@northstardynamics\.demo$'),
    CONSTRAINT users_status_check
        CHECK (status IN ('active', 'suspended', 'terminated', 'on_leave')),
    CONSTRAINT users_termination_after_hire_check
        CHECK (termination_date IS NULL OR hire_date IS NULL OR termination_date >= hire_date)
);

-- -----------------------------------------------------------------------------
-- 3.5 customers
-- External client companies that purchase NorthStar Dynamics products and
-- services. Each customer is owned by one internal organization/subsidiary
-- and (optionally) assigned an internal account manager.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    account_manager_id  UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    company_name        TEXT NOT NULL,
    contact_first_name  TEXT,
    contact_last_name   TEXT,
    email               VARCHAR(255) NOT NULL,
    phone               TEXT,
    industry            TEXT,
    website             TEXT,
    address_line1       TEXT,
    address_line2       TEXT,
    city                TEXT,
    state_province      TEXT,
    postal_code         TEXT,
    country             TEXT,
    status              TEXT NOT NULL DEFAULT 'active',
    notes               TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    CONSTRAINT customers_email_unique UNIQUE (email),
    CONSTRAINT customers_status_check
        CHECK (status IN ('active', 'inactive', 'prospect', 'churned'))
);

-- -----------------------------------------------------------------------------
-- 3.6 products
-- Catalog of software products and services sold to customers.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku                 VARCHAR(50) NOT NULL,
    name                TEXT NOT NULL,
    category            TEXT NOT NULL,
    description         TEXT,
    unit_price          NUMERIC(12, 2) NOT NULL,
    currency            VARCHAR(3) NOT NULL DEFAULT 'USD',
    is_subscription     BOOLEAN NOT NULL DEFAULT FALSE,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    status              TEXT NOT NULL DEFAULT 'active',
    notes               TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    CONSTRAINT products_sku_unique UNIQUE (sku),
    CONSTRAINT products_unit_price_check CHECK (unit_price >= 0),
    CONSTRAINT products_status_check
        CHECK (status IN ('active', 'deprecated', 'discontinued', 'draft')),
    CONSTRAINT products_currency_check
        CHECK (currency ~ '^[A-Z]{3}$')
);

-- -----------------------------------------------------------------------------
-- 3.7 projects
-- Client engagements / implementation projects delivered by NorthStar
-- Dynamics for a given customer, owned by an internal organization and led
-- by an internal project manager.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
    customer_id         UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE ON UPDATE CASCADE,
    project_manager_id  UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    project_code        VARCHAR(30) NOT NULL,
    name                TEXT NOT NULL,
    description         TEXT,
    status              TEXT NOT NULL DEFAULT 'planning',
    start_date          DATE,
    end_date            DATE,
    budget              NUMERIC(14, 2),
    notes               TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    CONSTRAINT projects_project_code_unique UNIQUE (project_code),
    CONSTRAINT projects_status_check
        CHECK (status IN ('planning', 'active', 'on_hold', 'completed', 'archived', 'cancelled')),
    CONSTRAINT projects_budget_check CHECK (budget IS NULL OR budget >= 0),
    CONSTRAINT projects_end_after_start_check
        CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

-- -----------------------------------------------------------------------------
-- 3.8 orders
-- Sales orders placed by customers for a product, optionally tied to a
-- delivery project, and recorded by the internal user who created them.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number        VARCHAR(30) NOT NULL,
    customer_id         UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    project_id          UUID REFERENCES projects(id) ON DELETE SET NULL ON UPDATE CASCADE,
    product_id          UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    created_by          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    order_date          DATE NOT NULL DEFAULT CURRENT_DATE,
    quantity            INTEGER NOT NULL DEFAULT 1,
    unit_price          NUMERIC(12, 2) NOT NULL,
    total_amount        NUMERIC(14, 2) NOT NULL,
    currency            VARCHAR(3) NOT NULL DEFAULT 'USD',
    status              TEXT NOT NULL DEFAULT 'pending',
    notes               TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    CONSTRAINT orders_order_number_unique UNIQUE (order_number),
    CONSTRAINT orders_status_check
        CHECK (status IN ('pending', 'processing', 'completed', 'cancelled', 'refunded')),
    CONSTRAINT orders_quantity_check CHECK (quantity > 0),
    CONSTRAINT orders_unit_price_check CHECK (unit_price >= 0),
    CONSTRAINT orders_total_amount_check CHECK (total_amount >= 0),
    CONSTRAINT orders_currency_check
        CHECK (currency ~ '^[A-Z]{3}$')
);

-- -----------------------------------------------------------------------------
-- 3.9 invoices
-- Billing documents issued against an order.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number      VARCHAR(30) NOT NULL,
    order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE ON UPDATE CASCADE,
    customer_id         UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    issue_date          DATE NOT NULL,
    due_date            DATE NOT NULL,
    status              TEXT NOT NULL DEFAULT 'draft',
    subtotal            NUMERIC(14, 2) NOT NULL,
    tax_amount          NUMERIC(14, 2) NOT NULL DEFAULT 0,
    total_amount        NUMERIC(14, 2) NOT NULL,
    amount_paid         NUMERIC(14, 2) NOT NULL DEFAULT 0,
    currency            VARCHAR(3) NOT NULL DEFAULT 'USD',
    paid_at             TIMESTAMPTZ,
    notes               TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    CONSTRAINT invoices_invoice_number_unique UNIQUE (invoice_number),
    CONSTRAINT invoices_status_check
        CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled', 'void')),
    CONSTRAINT invoices_due_after_issue_check CHECK (due_date >= issue_date),
    CONSTRAINT invoices_subtotal_check CHECK (subtotal >= 0),
    CONSTRAINT invoices_tax_amount_check CHECK (tax_amount >= 0),
    CONSTRAINT invoices_total_amount_check CHECK (total_amount >= 0),
    CONSTRAINT invoices_amount_paid_check CHECK (amount_paid >= 0),
    CONSTRAINT invoices_currency_check
        CHECK (currency ~ '^[A-Z]{3}$')
);

-- -----------------------------------------------------------------------------
-- 3.10 activity_logs
-- Audit trail of user and system actions (logins, exports, imports,
-- backups, record changes, etc.) across the platform.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID REFERENCES organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
    user_id             UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    entity_type         VARCHAR(50) NOT NULL,
    entity_id           UUID,
    action              VARCHAR(50) NOT NULL,
    description          TEXT,
    ip_address          INET,
    user_agent          TEXT,
    status              TEXT NOT NULL DEFAULT 'success',
    metadata            JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT activity_logs_status_check
        CHECK (status IN ('success', 'failure', 'warning', 'info'))
);

-- =============================================================================
-- 4. DEFERRED / CIRCULAR FOREIGN KEYS
-- =============================================================================

-- departments.head_user_id references users(id); added post-creation because
-- departments and users otherwise form a circular dependency at CREATE TABLE
-- time (users.department_id -> departments.id).
ALTER TABLE departments
    ADD COLUMN head_user_id UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- 5. INDEXES
-- =============================================================================

-- organizations
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_organizations_country ON organizations (country);
CREATE INDEX IF NOT EXISTS idx_organizations_metadata_gin ON organizations USING GIN (metadata);

-- departments
CREATE INDEX IF NOT EXISTS idx_departments_organization_id ON departments (organization_id);
CREATE INDEX IF NOT EXISTS idx_departments_head_user_id ON departments (head_user_id);
CREATE INDEX IF NOT EXISTS idx_departments_status ON departments (status) WHERE deleted_at IS NULL;

-- roles
CREATE INDEX IF NOT EXISTS idx_roles_status ON roles (status);
CREATE INDEX IF NOT EXISTS idx_roles_department_category ON roles (department_category);

-- users
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users (organization_id);
CREATE INDEX IF NOT EXISTS idx_users_department_id ON users (department_id);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users (role_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON users (last_login_at);
CREATE INDEX IF NOT EXISTS idx_users_metadata_gin ON users USING GIN (metadata);

-- customers
CREATE INDEX IF NOT EXISTS idx_customers_organization_id ON customers (organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_account_manager_id ON customers (account_manager_id);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_company_name ON customers (company_name);
CREATE INDEX IF NOT EXISTS idx_customers_country ON customers (country);

-- products
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
CREATE INDEX IF NOT EXISTS idx_products_status ON products (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products (is_active);

-- projects
CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON projects (organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_customer_id ON projects (customer_id);
CREATE INDEX IF NOT EXISTS idx_projects_project_manager_id ON projects (project_manager_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_start_date ON projects (start_date);

-- orders
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_project_id ON orders (project_id);
CREATE INDEX IF NOT EXISTS idx_orders_product_id ON orders (product_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_by ON orders (created_by);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders (order_date);

-- invoices
CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON invoices (order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices (customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices (due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON invoices (issue_date);

-- activity_logs
CREATE INDEX IF NOT EXISTS idx_activity_logs_organization_id ON activity_logs (organization_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs (action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_metadata_gin ON activity_logs USING GIN (metadata);

-- =============================================================================
-- 6. TRIGGERS (updated_at maintenance)
-- =============================================================================

CREATE TRIGGER trg_organizations_set_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_departments_set_updated_at
    BEFORE UPDATE ON departments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_roles_set_updated_at
    BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_customers_set_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_products_set_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_projects_set_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_orders_set_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_invoices_set_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_activity_logs_set_updated_at
    BEFORE UPDATE ON activity_logs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 7. TABLE & COLUMN COMMENTS
-- =============================================================================

COMMENT ON TABLE organizations IS 'NorthStar Dynamics HQ and its regional subsidiaries / business units.';
COMMENT ON TABLE departments   IS 'Organizational sub-units within an organization (Engineering, Sales, Finance, etc.).';
COMMENT ON TABLE roles         IS 'Company-wide catalog of job/permission roles assignable to users.';
COMMENT ON TABLE users         IS 'Internal NorthStar Dynamics employees and system users.';
COMMENT ON TABLE customers     IS 'External client companies purchasing NorthStar Dynamics products and services.';
COMMENT ON TABLE products      IS 'Catalog of software products and professional services sold to customers.';
COMMENT ON TABLE projects      IS 'Client delivery/implementation engagements tied to a customer and internal PM.';
COMMENT ON TABLE orders        IS 'Sales orders placed by customers for a product.';
COMMENT ON TABLE invoices      IS 'Billing documents issued against an order.';
COMMENT ON TABLE activity_logs IS 'Audit trail of user and system actions across the platform.';

COMMENT ON COLUMN departments.head_user_id IS 'User heading this department. Added post-creation to resolve the departments<->users circular reference.';
COMMENT ON COLUMN orders.total_amount IS 'quantity * unit_price at time of order, in orders.currency.';
COMMENT ON COLUMN invoices.total_amount IS 'subtotal + tax_amount, in invoices.currency.';

COMMENT ON COLUMN organizations.phone IS 'Demo data only: numbers use the 555-01XX trunk reserved by NANP (and Ofcom''s 020 7946 range for UK) for fictional/entertainment use, never assigned to a real subscriber.';
COMMENT ON COLUMN organizations.tax_id IS 'Demo data only: fictitious identifier, not a real registered tax/company ID. All seed values are marked with a DEMO segment.';
COMMENT ON COLUMN users.phone IS 'Demo data only: see organizations.phone for the fictitious-number convention used throughout this dataset.';
COMMENT ON COLUMN customers.phone IS 'Demo data only: see organizations.phone for the fictitious-number convention used throughout this dataset.';

COMMIT;