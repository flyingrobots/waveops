# WaveOps Enterprise Infrastructure as Code
# Main Terraform configuration for multi-cloud deployment

terraform {
  required_version = ">= 1.5"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  backend "s3" {
    bucket         = var.terraform_state_bucket
    key            = "waveops/terraform.tfstate"
    region         = var.aws_region
    encrypt        = true
    dynamodb_table = var.terraform_lock_table
  }
}

# Provider configurations
provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = local.common_tags
  }
}

provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
  
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
  }
}

provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
    
    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
    }
  }
}

# Local values
locals {
  name_prefix = "${var.project_name}-${var.environment}"
  
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
    Application = "waveops"
    Team        = "platform"
  }

  # Calculate availability zones
  azs = slice(data.aws_availability_zones.available.names, 0, 3)
}

# Data sources
data "aws_availability_zones" "available" {
  state = "available"
  
  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

data "aws_caller_identity" "current" {}

# Random password generation
resource "random_password" "database_password" {
  length  = 32
  special = true
}

resource "random_password" "redis_password" {
  length  = 32
  special = false
}

resource "random_password" "grafana_password" {
  length  = 16
  special = false
}

# VPC and Networking
module "vpc" {
  source = "./modules/vpc"
  
  name_prefix = local.name_prefix
  
  cidr = var.vpc_cidr
  azs  = local.azs
  
  private_subnets      = var.private_subnet_cidrs
  public_subnets       = var.public_subnet_cidrs
  database_subnets     = var.database_subnet_cidrs
  elasticache_subnets  = var.elasticache_subnet_cidrs
  
  enable_nat_gateway     = true
  single_nat_gateway     = var.environment == "development"
  enable_vpn_gateway     = false
  enable_dns_hostnames   = true
  enable_dns_support     = true
  
  # VPC Flow Logs
  enable_flow_log                      = true
  create_flow_log_cloudwatch_log_group = true
  create_flow_log_cloudwatch_iam_role  = true
  flow_log_max_aggregation_interval    = 60
  
  tags = local.common_tags
}

# Security Groups
module "security_groups" {
  source = "./modules/security-groups"
  
  name_prefix = local.name_prefix
  vpc_id      = module.vpc.vpc_id
  vpc_cidr    = var.vpc_cidr
  
  tags = local.common_tags
}

# RDS Database
module "rds" {
  source = "./modules/rds"
  
  name_prefix = local.name_prefix
  
  db_name     = var.database_name
  db_username = var.database_username
  db_password = random_password.database_password.result
  
  instance_class    = var.database_instance_class
  allocated_storage = var.database_allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true
  
  multi_az = var.environment != "development"
  
  vpc_security_group_ids = [module.security_groups.rds_security_group_id]
  db_subnet_group_name   = module.vpc.database_subnet_group
  
  backup_retention_period = var.database_backup_retention_days
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"
  
  monitoring_interval = 60
  monitoring_role_arn = module.rds.enhanced_monitoring_iam_role_arn
  
  performance_insights_enabled = true
  create_cloudwatch_log_group  = true
  
  tags = local.common_tags
}

# ElastiCache Redis
module "redis" {
  source = "./modules/redis"
  
  name_prefix = local.name_prefix
  
  node_type           = var.redis_node_type
  num_cache_nodes     = var.redis_num_nodes
  port                = 6379
  parameter_group     = "default.redis7"
  auth_token          = random_password.redis_password.result
  transit_encryption  = true
  at_rest_encryption  = true
  
  subnet_group_name   = module.vpc.elasticache_subnet_group_name
  security_group_ids  = [module.security_groups.redis_security_group_id]
  
  # High availability for production
  automatic_failover_enabled = var.environment != "development"
  num_node_groups           = var.environment != "development" ? 2 : 1
  replicas_per_node_group   = var.environment != "development" ? 1 : 0
  
  tags = local.common_tags
}

# EKS Cluster
module "eks" {
  source = "./modules/eks"
  
  name_prefix = local.name_prefix
  
  cluster_version = var.eks_cluster_version
  
  vpc_id                    = module.vpc.vpc_id
  subnet_ids                = module.vpc.private_subnets
  control_plane_subnet_ids  = module.vpc.public_subnets
  
  # Control plane logging
  cluster_enabled_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]
  cloudwatch_log_group_retention_in_days = 30
  
  # Security
  cluster_encryption_config = {
    provider_key_arn = aws_kms_key.eks.arn
    resources        = ["secrets"]
  }
  
  # Node groups
  managed_node_groups = {
    waveops_primary = {
      name = "${local.name_prefix}-primary"
      
      instance_types = var.eks_node_instance_types
      capacity_type  = "ON_DEMAND"
      
      min_size     = var.eks_node_group_min_size
      max_size     = var.eks_node_group_max_size
      desired_size = var.eks_node_group_desired_size
      
      # Use custom launch template for better control
      use_custom_launch_template = true
      disk_size                 = 50
      
      # Kubernetes labels
      labels = {
        Environment = var.environment
        NodeGroup   = "primary"
        Application = "waveops"
      }
      
      # Taints for dedicated workloads
      taints = var.environment == "production" ? {
        coordination = {
          key    = "coordination"
          value  = "true"
          effect = "NO_SCHEDULE"
        }
      } : {}
      
      tags = merge(local.common_tags, {
        NodeGroup = "primary"
      })
    }
    
    # Spot instances for cost optimization in non-production
    waveops_spot = var.enable_spot_instances ? {
      name = "${local.name_prefix}-spot"
      
      instance_types = var.eks_spot_instance_types
      capacity_type  = "SPOT"
      
      min_size     = 0
      max_size     = var.eks_spot_max_size
      desired_size = var.eks_spot_desired_size
      
      labels = {
        Environment = var.environment
        NodeGroup   = "spot"
        Application = "waveops"
      }
      
      tags = merge(local.common_tags, {
        NodeGroup = "spot"
      })
    } : {}
  }
  
  # OIDC for service accounts
  enable_irsa = true
  
  # Add-ons
  cluster_addons = {
    coredns = {
      addon_version = var.coredns_version
      resolve_conflicts = "OVERWRITE"
    }
    kube-proxy = {
      addon_version = var.kube_proxy_version
    }
    vpc-cni = {
      addon_version = var.vpc_cni_version
      resolve_conflicts = "OVERWRITE"
    }
    aws-ebs-csi-driver = {
      addon_version = var.ebs_csi_driver_version
      resolve_conflicts = "OVERWRITE"
    }
  }
  
  tags = local.common_tags
}

# KMS Keys
resource "aws_kms_key" "eks" {
  description             = "EKS Secret Encryption Key for ${local.name_prefix}"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-eks-encryption-key"
  })
}

resource "aws_kms_alias" "eks" {
  name          = "alias/${local.name_prefix}-eks"
  target_key_id = aws_kms_key.eks.key_id
}

resource "aws_kms_key" "rds" {
  description             = "RDS Encryption Key for ${local.name_prefix}"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-rds-encryption-key"
  })
}

resource "aws_kms_alias" "rds" {
  name          = "alias/${local.name_prefix}-rds"
  target_key_id = aws_kms_key.rds.key_id
}

# Application Load Balancer
resource "aws_lb" "waveops" {
  name               = "${local.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [module.security_groups.alb_security_group_id]
  subnets           = module.vpc.public_subnets
  
  enable_deletion_protection = var.environment == "production"
  
  # Access logs
  access_logs {
    bucket  = aws_s3_bucket.alb_logs.bucket
    prefix  = "alb"
    enabled = true
  }
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-alb"
  })
}

# S3 Bucket for ALB access logs
resource "aws_s3_bucket" "alb_logs" {
  bucket        = "${local.name_prefix}-alb-logs-${random_id.bucket_suffix.hex}"
  force_destroy = var.environment != "production"
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-alb-logs"
  })
}

resource "random_id" "bucket_suffix" {
  byte_length = 8
}

resource "aws_s3_bucket_policy" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  policy = data.aws_iam_policy_document.alb_logs.json
}

data "aws_iam_policy_document" "alb_logs" {
  statement {
    principals {
      type        = "AWS"
      identifiers = [data.aws_elb_service_account.main.arn]
    }
    
    actions = [
      "s3:PutObject"
    ]
    
    resources = [
      "${aws_s3_bucket.alb_logs.arn}/*"
    ]
  }
}

data "aws_elb_service_account" "main" {}

resource "aws_s3_bucket_lifecycle_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  
  rule {
    id     = "alb_logs_lifecycle"
    status = "Enabled"
    
    expiration {
      days = var.alb_logs_retention_days
    }
  }
}

# Route53 and ACM for custom domain
resource "aws_route53_zone" "waveops" {
  count = var.domain_name != "" ? 1 : 0
  name  = var.domain_name
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-zone"
  })
}

resource "aws_acm_certificate" "waveops" {
  count = var.domain_name != "" ? 1 : 0
  
  domain_name       = var.domain_name
  subject_alternative_names = [
    "*.${var.domain_name}",
    "api.${var.domain_name}",
    "monitoring.${var.domain_name}"
  ]
  validation_method = "DNS"
  
  lifecycle {
    create_before_destroy = true
  }
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-certificate"
  })
}

# WaveOps Helm Chart Deployment
resource "helm_release" "waveops" {
  depends_on = [
    module.eks,
    kubernetes_namespace.waveops
  ]
  
  name       = "waveops"
  namespace  = "waveops"
  chart      = "../helm/waveops"
  
  # Production-ready configuration
  values = [templatefile("${path.module}/values/waveops-${var.environment}.yaml", {
    # Database configuration
    database_host     = module.rds.db_instance_endpoint
    database_name     = var.database_name
    database_username = var.database_username
    database_password = random_password.database_password.result
    
    # Redis configuration
    redis_endpoint = module.redis.primary_endpoint
    redis_password = random_password.redis_password.result
    
    # Domain and TLS
    domain_name = var.domain_name
    
    # Resource limits
    replica_count = var.waveops_replica_count
    
    # Monitoring
    monitoring_enabled = true
    tracing_enabled    = true
    
    # Auto-scaling
    autoscaling_enabled     = var.enable_autoscaling
    autoscaling_min_replicas = var.autoscaling_min_replicas
    autoscaling_max_replicas = var.autoscaling_max_replicas
    
    # High availability
    ha_enabled = var.environment != "development"
  })]
  
  # Security
  set_sensitive {
    name  = "secrets.database.password"
    value = random_password.database_password.result
  }
  
  set_sensitive {
    name  = "secrets.redis.password"
    value = random_password.redis_password.result
  }
  
  set_sensitive {
    name  = "secrets.jwt.secret"
    value = random_password.jwt_secret.result
  }
  
  set_sensitive {
    name  = "secrets.encryption.key"
    value = random_password.encryption_key.result
  }
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "random_password" "encryption_key" {
  length  = 32
  special = false
}

# Kubernetes namespace
resource "kubernetes_namespace" "waveops" {
  metadata {
    name = "waveops"
    
    labels = {
      name                = "waveops"
      "app.kubernetes.io/name" = "waveops"
    }
    
    annotations = {
      "kubernetes.io/managed-by" = "terraform"
    }
  }
}

# Monitoring Stack
module "monitoring" {
  source = "./modules/monitoring"
  
  name_prefix = local.name_prefix
  namespace   = "monitoring"
  
  # Prometheus configuration
  prometheus_retention          = var.prometheus_retention
  prometheus_storage_size       = var.prometheus_storage_size
  
  # Grafana configuration
  grafana_admin_password = random_password.grafana_password.result
  grafana_domain        = var.domain_name != "" ? "monitoring.${var.domain_name}" : ""
  
  # AlertManager configuration
  alertmanager_config = {
    slack_webhook_url = var.slack_webhook_url
    pagerduty_key    = var.pagerduty_integration_key
  }
  
  depends_on = [
    helm_release.waveops
  ]
  
  tags = local.common_tags
}

# Backup and Disaster Recovery
module "backup" {
  source = "./modules/backup"
  
  name_prefix = local.name_prefix
  
  # RDS backup configuration
  rds_instance_id = module.rds.db_instance_identifier
  
  # EFS backup for persistent volumes
  backup_retention_days = var.backup_retention_days
  
  tags = local.common_tags
}

# Cost Optimization
module "cost_optimization" {
  source = "./modules/cost-optimization"
  
  name_prefix = local.name_prefix
  environment = var.environment
  
  # Enable spot instances for non-production
  enable_spot_instances = var.enable_spot_instances
  
  # Resource scheduling for development
  enable_resource_scheduling = var.environment == "development"
  
  # Cost budgets and alerts
  monthly_budget_limit = var.monthly_budget_limit
  cost_anomaly_detection = var.enable_cost_anomaly_detection
  
  tags = local.common_tags
}

# Security baseline
module "security" {
  source = "./modules/security"
  
  name_prefix = local.name_prefix
  
  # GuardDuty for threat detection
  enable_guardduty = var.enable_guardduty
  
  # Config for compliance
  enable_config = var.enable_config
  
  # CloudTrail for audit logging
  enable_cloudtrail = var.enable_cloudtrail
  cloudtrail_s3_bucket = aws_s3_bucket.cloudtrail.bucket
  
  # Security Hub
  enable_security_hub = var.enable_security_hub
  
  tags = local.common_tags
}

# CloudTrail S3 bucket
resource "aws_s3_bucket" "cloudtrail" {
  bucket        = "${local.name_prefix}-cloudtrail-${random_id.cloudtrail_suffix.hex}"
  force_destroy = var.environment != "production"
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-cloudtrail"
  })
}

resource "random_id" "cloudtrail_suffix" {
  byte_length = 8
}

resource "aws_s3_bucket_lifecycle_configuration" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id
  
  rule {
    id     = "cloudtrail_lifecycle"
    status = "Enabled"
    
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
    
    transition {
      days          = 90
      storage_class = "GLACIER"
    }
    
    expiration {
      days = var.cloudtrail_retention_days
    }
  }
}