# WaveOps Enterprise Infrastructure Variables
# Comprehensive variable definitions for multi-environment deployment

# Project Configuration
variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "waveops"
}

variable "environment" {
  description = "Environment name (development, staging, production)"
  type        = string
  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be one of: development, staging, production."
  }
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-west-2"
}

# Terraform State Management
variable "terraform_state_bucket" {
  description = "S3 bucket for Terraform state"
  type        = string
}

variable "terraform_lock_table" {
  description = "DynamoDB table for Terraform state locking"
  type        = string
}

# Networking Configuration
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
}

variable "database_subnet_cidrs" {
  description = "CIDR blocks for database subnets"
  type        = list(string)
  default     = ["10.0.201.0/24", "10.0.202.0/24", "10.0.203.0/24"]
}

variable "elasticache_subnet_cidrs" {
  description = "CIDR blocks for ElastiCache subnets"
  type        = list(string)
  default     = ["10.0.211.0/24", "10.0.212.0/24", "10.0.213.0/24"]
}

# Database Configuration
variable "database_name" {
  description = "Name of the RDS database"
  type        = string
  default     = "waveops"
}

variable "database_username" {
  description = "Username for the RDS database"
  type        = string
  default     = "waveops"
}

variable "database_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.r6g.large"
}

variable "database_allocated_storage" {
  description = "Allocated storage for RDS database (GB)"
  type        = number
  default     = 100
}

variable "database_backup_retention_days" {
  description = "Backup retention period for RDS database"
  type        = number
  default     = 7
}

# Redis Configuration
variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.r6g.large"
}

variable "redis_num_nodes" {
  description = "Number of Redis cache nodes"
  type        = number
  default     = 2
}

# EKS Configuration
variable "eks_cluster_version" {
  description = "Kubernetes version for EKS cluster"
  type        = string
  default     = "1.28"
}

variable "eks_node_instance_types" {
  description = "Instance types for EKS managed node groups"
  type        = list(string)
  default     = ["m6i.large", "m6i.xlarge"]
}

variable "eks_node_group_min_size" {
  description = "Minimum size of EKS node group"
  type        = number
  default     = 2
}

variable "eks_node_group_max_size" {
  description = "Maximum size of EKS node group"
  type        = number
  default     = 20
}

variable "eks_node_group_desired_size" {
  description = "Desired size of EKS node group"
  type        = number
  default     = 3
}

# Spot Instances Configuration
variable "enable_spot_instances" {
  description = "Enable spot instances for cost optimization"
  type        = bool
  default     = false
}

variable "eks_spot_instance_types" {
  description = "Instance types for spot instances"
  type        = list(string)
  default     = ["m5.large", "m5.xlarge", "m5a.large", "m5a.xlarge"]
}

variable "eks_spot_max_size" {
  description = "Maximum size of spot node group"
  type        = number
  default     = 10
}

variable "eks_spot_desired_size" {
  description = "Desired size of spot node group"
  type        = number
  default     = 0
}

# EKS Add-ons Versions
variable "coredns_version" {
  description = "Version of CoreDNS add-on"
  type        = string
  default     = "v1.10.1-eksbuild.4"
}

variable "kube_proxy_version" {
  description = "Version of kube-proxy add-on"
  type        = string
  default     = "v1.28.2-eksbuild.2"
}

variable "vpc_cni_version" {
  description = "Version of VPC CNI add-on"
  type        = string
  default     = "v1.15.1-eksbuild.1"
}

variable "ebs_csi_driver_version" {
  description = "Version of EBS CSI driver add-on"
  type        = string
  default     = "v1.24.0-eksbuild.1"
}

# WaveOps Application Configuration
variable "waveops_replica_count" {
  description = "Number of WaveOps application replicas"
  type        = number
  default     = 3
}

variable "enable_autoscaling" {
  description = "Enable horizontal pod autoscaling for WaveOps"
  type        = bool
  default     = true
}

variable "autoscaling_min_replicas" {
  description = "Minimum replicas for autoscaling"
  type        = number
  default     = 2
}

variable "autoscaling_max_replicas" {
  description = "Maximum replicas for autoscaling"
  type        = number
  default     = 20
}

# Domain and SSL Configuration
variable "domain_name" {
  description = "Domain name for WaveOps (leave empty to skip Route53 setup)"
  type        = string
  default     = ""
}

# Monitoring Configuration
variable "prometheus_retention" {
  description = "Prometheus data retention period"
  type        = string
  default     = "30d"
}

variable "prometheus_storage_size" {
  description = "Prometheus storage size"
  type        = string
  default     = "100Gi"
}

variable "slack_webhook_url" {
  description = "Slack webhook URL for alerts (optional)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "pagerduty_integration_key" {
  description = "PagerDuty integration key for alerts (optional)"
  type        = string
  default     = ""
  sensitive   = true
}

# Backup and Disaster Recovery
variable "backup_retention_days" {
  description = "Backup retention period in days"
  type        = number
  default     = 30
}

variable "alb_logs_retention_days" {
  description = "ALB access logs retention period in days"
  type        = number
  default     = 30
}

variable "cloudtrail_retention_days" {
  description = "CloudTrail logs retention period in days"
  type        = number
  default     = 90
}

# Cost Management
variable "monthly_budget_limit" {
  description = "Monthly budget limit in USD"
  type        = number
  default     = 1000
}

variable "enable_cost_anomaly_detection" {
  description = "Enable AWS Cost Anomaly Detection"
  type        = bool
  default     = true
}

# Security Configuration
variable "enable_guardduty" {
  description = "Enable AWS GuardDuty for threat detection"
  type        = bool
  default     = true
}

variable "enable_config" {
  description = "Enable AWS Config for compliance monitoring"
  type        = bool
  default     = true
}

variable "enable_cloudtrail" {
  description = "Enable AWS CloudTrail for audit logging"
  type        = bool
  default     = true
}

variable "enable_security_hub" {
  description = "Enable AWS Security Hub"
  type        = bool
  default     = true
}

# GitHub Integration (for CI/CD)
variable "github_org" {
  description = "GitHub organization name"
  type        = string
  default     = ""
}

variable "github_repo" {
  description = "GitHub repository name"
  type        = string
  default     = "waveops"
}

variable "github_token" {
  description = "GitHub personal access token"
  type        = string
  default     = ""
  sensitive   = true
}

# Feature Flags
variable "enable_multi_region" {
  description = "Enable multi-region deployment"
  type        = bool
  default     = false
}

variable "enable_disaster_recovery" {
  description = "Enable disaster recovery setup"
  type        = bool
  default     = false
}

variable "enable_compliance_monitoring" {
  description = "Enable compliance monitoring and reporting"
  type        = bool
  default     = true
}

# Performance Tuning
variable "enable_performance_insights" {
  description = "Enable RDS Performance Insights"
  type        = bool
  default     = true
}

variable "enable_enhanced_monitoring" {
  description = "Enable RDS Enhanced Monitoring"
  type        = bool
  default     = true
}

# Development Environment Specific
variable "enable_bastion_host" {
  description = "Enable bastion host for development access"
  type        = bool
  default     = false
}

variable "bastion_instance_type" {
  description = "Instance type for bastion host"
  type        = string
  default     = "t3.micro"
}

# Advanced Networking
variable "enable_vpc_endpoints" {
  description = "Enable VPC endpoints for AWS services"
  type        = bool
  default     = true
}

variable "enable_private_dns" {
  description = "Enable private DNS resolution"
  type        = bool
  default     = true
}

# Container Insights and Logging
variable "enable_container_insights" {
  description = "Enable CloudWatch Container Insights"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 14
}

# Resource Tagging Strategy
variable "additional_tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}

# Scaling and Performance
variable "enable_cluster_autoscaler" {
  description = "Enable Kubernetes Cluster Autoscaler"
  type        = bool
  default     = true
}

variable "enable_vertical_pod_autoscaler" {
  description = "Enable Vertical Pod Autoscaler"
  type        = bool
  default     = false
}

variable "enable_metrics_server" {
  description = "Enable Kubernetes Metrics Server"
  type        = bool
  default     = true
}

# Security Hardening
variable "enable_pod_security_policy" {
  description = "Enable Pod Security Policies"
  type        = bool
  default     = false
}

variable "enable_network_policy" {
  description = "Enable Kubernetes Network Policies"
  type        = bool
  default     = true
}

variable "enable_secrets_encryption" {
  description = "Enable encryption at rest for Kubernetes secrets"
  type        = bool
  default     = true
}

# Disaster Recovery and Business Continuity
variable "cross_region_backup" {
  description = "Enable cross-region backup replication"
  type        = bool
  default     = false
}

variable "backup_cross_region" {
  description = "Cross-region for backup replication"
  type        = string
  default     = "us-east-1"
}

# Observability and Monitoring
variable "enable_service_mesh" {
  description = "Enable service mesh (Istio/Linkerd)"
  type        = bool
  default     = false
}

variable "service_mesh_type" {
  description = "Type of service mesh to deploy"
  type        = string
  default     = "linkerd"
  validation {
    condition     = contains(["istio", "linkerd", "consul-connect"], var.service_mesh_type)
    error_message = "Service mesh type must be one of: istio, linkerd, consul-connect."
  }
}

variable "enable_distributed_tracing" {
  description = "Enable distributed tracing with Jaeger"
  type        = bool
  default     = true
}

# GitOps and CI/CD
variable "enable_argocd" {
  description = "Enable ArgoCD for GitOps"
  type        = bool
  default     = false
}

variable "enable_flux" {
  description = "Enable Flux for GitOps"
  type        = bool
  default     = false
}

# Database Performance and Scaling
variable "enable_read_replica" {
  description = "Enable RDS read replica"
  type        = bool
  default     = false
}

variable "read_replica_count" {
  description = "Number of read replicas to create"
  type        = number
  default     = 1
}

# Cache Configuration
variable "redis_cluster_mode" {
  description = "Enable Redis cluster mode"
  type        = bool
  default     = false
}

variable "redis_automatic_failover" {
  description = "Enable Redis automatic failover"
  type        = bool
  default     = true
}

# Load Testing and Performance
variable "enable_load_testing" {
  description = "Enable load testing infrastructure"
  type        = bool
  default     = false
}

# External Secrets Integration
variable "enable_external_secrets" {
  description = "Enable External Secrets Operator"
  type        = bool
  default     = false
}

variable "secrets_backend" {
  description = "External secrets backend"
  type        = string
  default     = "aws-secrets-manager"
  validation {
    condition = contains([
      "aws-secrets-manager",
      "aws-parameter-store",
      "hashicorp-vault",
      "azure-key-vault",
      "gcp-secret-manager"
    ], var.secrets_backend)
    error_message = "Secrets backend must be a supported provider."
  }
}

# Progressive Delivery
variable "enable_progressive_delivery" {
  description = "Enable progressive delivery with Argo Rollouts"
  type        = bool
  default     = false
}

# Cost Optimization Advanced
variable "enable_karpenter" {
  description = "Enable Karpenter for node provisioning"
  type        = bool
  default     = false
}

variable "enable_spot_interruption_handler" {
  description = "Enable AWS Node Termination Handler"
  type        = bool
  default     = true
}

# Multi-tenant Configuration
variable "enable_multi_tenancy" {
  description = "Enable multi-tenant configuration"
  type        = bool
  default     = false
}

variable "tenant_isolation_level" {
  description = "Level of tenant isolation"
  type        = string
  default     = "namespace"
  validation {
    condition     = contains(["namespace", "cluster", "node"], var.tenant_isolation_level)
    error_message = "Tenant isolation level must be one of: namespace, cluster, node."
  }
}