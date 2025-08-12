# WaveOps Enterprise Infrastructure Outputs
# Comprehensive outputs for infrastructure components

# VPC Outputs
output "vpc_id" {
  description = "ID of the VPC"
  value       = module.vpc.vpc_id
}

output "vpc_cidr_block" {
  description = "The CIDR block of the VPC"
  value       = module.vpc.vpc_cidr_block
}

output "private_subnets" {
  description = "List of IDs of private subnets"
  value       = module.vpc.private_subnets
}

output "public_subnets" {
  description = "List of IDs of public subnets"
  value       = module.vpc.public_subnets
}

output "database_subnets" {
  description = "List of IDs of database subnets"
  value       = module.vpc.database_subnets
}

output "nat_gateway_ids" {
  description = "List of IDs of the NAT Gateways"
  value       = module.vpc.natgw_ids
}

# EKS Cluster Outputs
output "cluster_id" {
  description = "EKS cluster ID"
  value       = module.eks.cluster_name
}

output "cluster_arn" {
  description = "The Amazon Resource Name (ARN) of the cluster"
  value       = module.eks.cluster_arn
}

output "cluster_endpoint" {
  description = "Endpoint for EKS control plane"
  value       = module.eks.cluster_endpoint
  sensitive   = true
}

output "cluster_version" {
  description = "The Kubernetes version for the EKS cluster"
  value       = module.eks.cluster_version
}

output "cluster_certificate_authority_data" {
  description = "Base64 encoded certificate data required to communicate with the cluster"
  value       = module.eks.cluster_certificate_authority_data
  sensitive   = true
}

output "cluster_security_group_id" {
  description = "Cluster security group that was created by Amazon EKS for the cluster"
  value       = module.eks.cluster_primary_security_group_id
}

output "node_groups" {
  description = "EKS node groups"
  value       = module.eks.managed_node_groups
  sensitive   = true
}

output "oidc_provider_arn" {
  description = "The ARN of the OIDC Provider if `enable_irsa = true`"
  value       = module.eks.oidc_provider_arn
}

# Database Outputs
output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = module.rds.db_instance_endpoint
  sensitive   = true
}

output "rds_port" {
  description = "RDS instance port"
  value       = module.rds.db_instance_port
}

output "rds_database_name" {
  description = "RDS database name"
  value       = module.rds.db_instance_name
}

output "rds_instance_id" {
  description = "RDS instance ID"
  value       = module.rds.db_instance_identifier
}

# Redis Outputs
output "redis_endpoint" {
  description = "Redis cluster endpoint"
  value       = module.redis.primary_endpoint
  sensitive   = true
}

output "redis_port" {
  description = "Redis port"
  value       = module.redis.port
}

output "redis_auth_token" {
  description = "Redis authentication token"
  value       = module.redis.auth_token
  sensitive   = true
}

# Load Balancer Outputs
output "load_balancer_dns" {
  description = "The DNS name of the load balancer"
  value       = aws_lb.waveops.dns_name
}

output "load_balancer_zone_id" {
  description = "The zone ID of the load balancer"
  value       = aws_lb.waveops.zone_id
}

output "load_balancer_arn" {
  description = "The ARN of the load balancer"
  value       = aws_lb.waveops.arn
}

# Route53 and SSL Outputs
output "route53_zone_id" {
  description = "Route53 zone ID"
  value       = var.domain_name != "" ? aws_route53_zone.waveops[0].zone_id : null
}

output "route53_zone_name_servers" {
  description = "Route53 zone name servers"
  value       = var.domain_name != "" ? aws_route53_zone.waveops[0].name_servers : null
}

output "acm_certificate_arn" {
  description = "The ARN of the ACM certificate"
  value       = var.domain_name != "" ? aws_acm_certificate.waveops[0].arn : null
}

output "acm_certificate_status" {
  description = "Status of the ACM certificate"
  value       = var.domain_name != "" ? aws_acm_certificate.waveops[0].status : null
}

# Security Outputs
output "kms_key_eks_id" {
  description = "The globally unique identifier for the EKS KMS key"
  value       = aws_kms_key.eks.key_id
}

output "kms_key_eks_arn" {
  description = "The Amazon Resource Name (ARN) of the EKS KMS key"
  value       = aws_kms_key.eks.arn
}

output "kms_key_rds_id" {
  description = "The globally unique identifier for the RDS KMS key"
  value       = aws_kms_key.rds.key_id
}

output "kms_key_rds_arn" {
  description = "The Amazon Resource Name (ARN) of the RDS KMS key"
  value       = aws_kms_key.rds.arn
}

# Security Group Outputs
output "security_group_alb_id" {
  description = "ID of the ALB security group"
  value       = module.security_groups.alb_security_group_id
}

output "security_group_rds_id" {
  description = "ID of the RDS security group"
  value       = module.security_groups.rds_security_group_id
}

output "security_group_redis_id" {
  description = "ID of the Redis security group"
  value       = module.security_groups.redis_security_group_id
}

# S3 Bucket Outputs
output "s3_bucket_alb_logs" {
  description = "S3 bucket name for ALB access logs"
  value       = aws_s3_bucket.alb_logs.bucket
}

output "s3_bucket_cloudtrail" {
  description = "S3 bucket name for CloudTrail logs"
  value       = aws_s3_bucket.cloudtrail.bucket
}

# Application Outputs
output "waveops_namespace" {
  description = "Kubernetes namespace for WaveOps"
  value       = kubernetes_namespace.waveops.metadata[0].name
}

output "waveops_helm_release_name" {
  description = "Helm release name for WaveOps"
  value       = helm_release.waveops.name
}

output "waveops_helm_release_status" {
  description = "Status of WaveOps Helm release"
  value       = helm_release.waveops.status
}

# Monitoring Outputs
output "prometheus_endpoint" {
  description = "Prometheus server endpoint"
  value       = module.monitoring.prometheus_endpoint
  sensitive   = true
}

output "grafana_endpoint" {
  description = "Grafana dashboard endpoint"
  value       = module.monitoring.grafana_endpoint
  sensitive   = true
}

output "grafana_admin_password" {
  description = "Grafana admin password"
  value       = random_password.grafana_password.result
  sensitive   = true
}

output "alertmanager_endpoint" {
  description = "AlertManager endpoint"
  value       = module.monitoring.alertmanager_endpoint
  sensitive   = true
}

# Cost Management Outputs
output "monthly_budget_name" {
  description = "Name of the monthly budget"
  value       = module.cost_optimization.budget_name
}

output "cost_anomaly_detector_arn" {
  description = "ARN of the cost anomaly detector"
  value       = module.cost_optimization.cost_anomaly_detector_arn
}

# Security and Compliance Outputs
output "guardduty_detector_id" {
  description = "GuardDuty detector ID"
  value       = module.security.guardduty_detector_id
}

output "config_configuration_recorder_name" {
  description = "AWS Config configuration recorder name"
  value       = module.security.config_recorder_name
}

output "cloudtrail_arn" {
  description = "CloudTrail ARN"
  value       = module.security.cloudtrail_arn
}

output "security_hub_account_id" {
  description = "Security Hub account ID"
  value       = module.security.security_hub_account_id
}

# Backup Outputs
output "backup_vault_arn" {
  description = "AWS Backup vault ARN"
  value       = module.backup.backup_vault_arn
}

output "backup_plan_id" {
  description = "AWS Backup plan ID"
  value       = module.backup.backup_plan_id
}

# Connection Information for kubectl
output "kubectl_config" {
  description = "kubectl config command to connect to the cluster"
  value       = "aws eks --region ${var.aws_region} update-kubeconfig --name ${module.eks.cluster_name}"
}

# Environment Information
output "environment" {
  description = "Environment name"
  value       = var.environment
}

output "aws_region" {
  description = "AWS region"
  value       = var.aws_region
}

output "project_name" {
  description = "Project name"
  value       = var.project_name
}

# URLs and Endpoints
output "application_urls" {
  description = "Application URLs"
  value = {
    waveops_api = var.domain_name != "" ? "https://api.${var.domain_name}" : "https://${aws_lb.waveops.dns_name}"
    waveops_ui  = var.domain_name != "" ? "https://${var.domain_name}" : "https://${aws_lb.waveops.dns_name}"
    monitoring  = var.domain_name != "" ? "https://monitoring.${var.domain_name}" : module.monitoring.grafana_endpoint
  }
}

# Database Connection String (for application configuration)
output "database_connection_parameters" {
  description = "Database connection parameters for application configuration"
  value = {
    host     = module.rds.db_instance_endpoint
    port     = module.rds.db_instance_port
    database = module.rds.db_instance_name
    username = var.database_username
    # Note: Password should be retrieved from AWS Secrets Manager in production
  }
  sensitive = true
}

# Redis Connection Parameters
output "redis_connection_parameters" {
  description = "Redis connection parameters for application configuration"
  value = {
    endpoint = module.redis.primary_endpoint
    port     = module.redis.port
    # Note: Auth token should be retrieved from AWS Secrets Manager in production
  }
  sensitive = true
}

# Resource ARNs for IAM policies and automation
output "resource_arns" {
  description = "ARNs of key resources for IAM policies and automation"
  value = {
    eks_cluster              = module.eks.cluster_arn
    rds_instance            = module.rds.db_instance_arn
    redis_cluster           = module.redis.arn
    kms_key_eks            = aws_kms_key.eks.arn
    kms_key_rds            = aws_kms_key.rds.arn
    s3_bucket_alb_logs     = aws_s3_bucket.alb_logs.arn
    s3_bucket_cloudtrail   = aws_s3_bucket.cloudtrail.arn
    load_balancer          = aws_lb.waveops.arn
  }
}

# Service Account ARNs for IRSA
output "service_account_arns" {
  description = "ARNs of service accounts created for the application"
  value       = module.eks.aws_iam_openid_connect_provider_arn
}

# Helm Chart Values for Reference
output "helm_values_checksum" {
  description = "Checksum of Helm values used for deployment"
  value       = helm_release.waveops.metadata[0].values
  sensitive   = true
}

# Feature Flags Status
output "enabled_features" {
  description = "Status of enabled features"
  value = {
    spot_instances                = var.enable_spot_instances
    autoscaling                  = var.enable_autoscaling
    guardduty                    = var.enable_guardduty
    config                       = var.enable_config
    cloudtrail                   = var.enable_cloudtrail
    security_hub                 = var.enable_security_hub
    cost_anomaly_detection       = var.enable_cost_anomaly_detection
    multi_region                 = var.enable_multi_region
    disaster_recovery           = var.enable_disaster_recovery
    compliance_monitoring       = var.enable_compliance_monitoring
    container_insights          = var.enable_container_insights
    cluster_autoscaler          = var.enable_cluster_autoscaler
    vertical_pod_autoscaler     = var.enable_vertical_pod_autoscaler
    network_policy              = var.enable_network_policy
    secrets_encryption          = var.enable_secrets_encryption
    distributed_tracing         = var.enable_distributed_tracing
  }
}

# Resource Counts and Scaling Information
output "resource_summary" {
  description = "Summary of deployed resources"
  value = {
    vpc_subnets_private   = length(module.vpc.private_subnets)
    vpc_subnets_public    = length(module.vpc.public_subnets)
    vpc_subnets_database  = length(module.vpc.database_subnets)
    eks_node_groups       = length(module.eks.managed_node_groups)
    waveops_replicas     = var.waveops_replica_count
    autoscaling_min      = var.autoscaling_min_replicas
    autoscaling_max      = var.autoscaling_max_replicas
  }
}

# Cost Optimization Information
output "cost_optimization_info" {
  description = "Cost optimization configuration"
  value = {
    monthly_budget_limit    = var.monthly_budget_limit
    spot_instances_enabled  = var.enable_spot_instances
    backup_retention_days   = var.backup_retention_days
    log_retention_days     = var.log_retention_days
  }
}

# Security Configuration Summary
output "security_configuration" {
  description = "Security configuration summary"
  value = {
    encryption_at_rest_enabled     = true
    encryption_in_transit_enabled  = true
    secrets_encrypted              = var.enable_secrets_encryption
    network_policies_enabled       = var.enable_network_policy
    guardduty_enabled             = var.enable_guardduty
    config_enabled                = var.enable_config
    cloudtrail_enabled            = var.enable_cloudtrail
    security_hub_enabled          = var.enable_security_hub
  }
}

# Next Steps and Documentation
output "next_steps" {
  description = "Next steps after infrastructure deployment"
  value = {
    kubectl_setup   = "Run: ${local.kubectl_config_command}"
    verify_pods     = "Run: kubectl get pods -n waveops"
    access_grafana  = "Access Grafana at: ${module.monitoring.grafana_endpoint}"
    check_health    = "Run: kubectl get nodes"
    view_logs       = "Run: kubectl logs -n waveops -l app.kubernetes.io/name=waveops"
  }
}

locals {
  kubectl_config_command = "aws eks --region ${var.aws_region} update-kubeconfig --name ${module.eks.cluster_name}"
}

# Conditional Outputs
output "domain_validation" {
  description = "Domain validation records for ACM certificate"
  value       = var.domain_name != "" ? aws_acm_certificate.waveops[0].domain_validation_options : null
}

output "spot_instance_info" {
  description = "Spot instance configuration"
  value = var.enable_spot_instances ? {
    instance_types = var.eks_spot_instance_types
    max_size       = var.eks_spot_max_size
    desired_size   = var.eks_spot_desired_size
  } : null
}

# Disaster Recovery Information
output "disaster_recovery_info" {
  description = "Disaster recovery configuration"
  value = var.enable_disaster_recovery ? {
    cross_region_backup = var.cross_region_backup
    backup_region      = var.backup_cross_region
  } : null
}

# Multi-region Information
output "multi_region_info" {
  description = "Multi-region deployment information"
  value = var.enable_multi_region ? {
    primary_region = var.aws_region
    # Additional regions would be defined in separate configurations
  } : null
}