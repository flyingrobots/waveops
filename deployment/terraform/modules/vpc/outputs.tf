# VPC Module Outputs

# VPC
output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "vpc_arn" {
  description = "The ARN of the VPC"
  value       = aws_vpc.main.arn
}

output "vpc_cidr_block" {
  description = "The CIDR block of the VPC"
  value       = aws_vpc.main.cidr_block
}

output "default_security_group_id" {
  description = "The ID of the security group created by default on VPC creation"
  value       = aws_vpc.main.default_security_group_id
}

output "default_network_acl_id" {
  description = "The ID of the default network ACL"
  value       = aws_vpc.main.default_network_acl_id
}

output "default_route_table_id" {
  description = "The ID of the default route table"
  value       = aws_vpc.main.default_route_table_id
}

output "vpc_instance_tenancy" {
  description = "Tenancy of instances spin up within VPC"
  value       = aws_vpc.main.instance_tenancy
}

output "vpc_enable_dns_support" {
  description = "Whether or not the VPC has DNS support"
  value       = aws_vpc.main.enable_dns_support
}

output "vpc_enable_dns_hostnames" {
  description = "Whether or not the VPC has DNS hostname support"
  value       = aws_vpc.main.enable_dns_hostnames
}

# Internet Gateway
output "igw_id" {
  description = "The ID of the Internet Gateway"
  value       = aws_internet_gateway.main.id
}

output "igw_arn" {
  description = "The ARN of the Internet Gateway"
  value       = aws_internet_gateway.main.arn
}

# Subnets
output "private_subnets" {
  description = "List of IDs of private subnets"
  value       = aws_subnet.private[*].id
}

output "public_subnets" {
  description = "List of IDs of public subnets"
  value       = aws_subnet.public[*].id
}

output "database_subnets" {
  description = "List of IDs of database subnets"
  value       = aws_subnet.database[*].id
}

output "elasticache_subnets" {
  description = "List of IDs of elasticache subnets"
  value       = aws_subnet.elasticache[*].id
}

output "private_subnet_arns" {
  description = "List of ARNs of private subnets"
  value       = aws_subnet.private[*].arn
}

output "public_subnet_arns" {
  description = "List of ARNs of public subnets"
  value       = aws_subnet.public[*].arn
}

output "database_subnet_arns" {
  description = "List of ARNs of database subnets"
  value       = aws_subnet.database[*].arn
}

output "elasticache_subnet_arns" {
  description = "List of ARNs of elasticache subnets"
  value       = aws_subnet.elasticache[*].arn
}

# Subnet Groups
output "database_subnet_group" {
  description = "ID of database subnet group"
  value       = try(aws_db_subnet_group.database[0].id, null)
}

output "database_subnet_group_name" {
  description = "Name of database subnet group"
  value       = try(aws_db_subnet_group.database[0].name, null)
}

output "elasticache_subnet_group_name" {
  description = "Name of elasticache subnet group"
  value       = try(aws_elasticache_subnet_group.elasticache[0].name, null)
}

# Route Tables
output "private_route_table_ids" {
  description = "List of IDs of the private route tables"
  value       = aws_route_table.private[*].id
}

output "public_route_table_ids" {
  description = "List of IDs of the public route tables"
  value       = [aws_route_table.public.id]
}

output "database_route_table_ids" {
  description = "List of IDs of the database route tables"
  value       = try(aws_route_table.database[*].id, [])
}

output "elasticache_route_table_ids" {
  description = "List of IDs of the elasticache route tables"
  value       = try(aws_route_table.elasticache[*].id, [])
}

# NAT Gateways
output "nat_ids" {
  description = "List of IDs of the NAT Gateways"
  value       = aws_nat_gateway.main[*].id
}

output "nat_public_ips" {
  description = "List of public Elastic IPs associated with NAT Gateways"
  value       = aws_eip.nat[*].public_ip
}

output "natgw_ids" {
  description = "List of IDs of the NAT Gateways"
  value       = aws_nat_gateway.main[*].id
}

# Elastic IPs
output "eip_nat_ids" {
  description = "List of allocation IDs of Elastic IPs for NAT Gateways"
  value       = aws_eip.nat[*].id
}

output "eip_nat_public_ips" {
  description = "List of public Elastic IPs associated with NAT Gateways"
  value       = aws_eip.nat[*].public_ip
}

# VPC Flow Logs
output "vpc_flow_log_id" {
  description = "The ID of the Flow Log resource"
  value       = try(aws_flow_log.vpc[0].id, null)
}

output "vpc_flow_log_destination_arn" {
  description = "The ARN of the destination for VPC Flow Logs"
  value       = try(aws_flow_log.vpc[0].log_destination, null)
}

output "vpc_flow_log_destination_type" {
  description = "The type of the destination for VPC Flow Logs"
  value       = try(aws_flow_log.vpc[0].log_destination_type, null)
}

output "vpc_flow_log_cloudwatch_iam_role_arn" {
  description = "The ARN of the IAM role used when pushing logs to Cloudwatch log group"
  value       = try(aws_iam_role.vpc_flow_log[0].arn, null)
}

# VPC Endpoints
output "vpc_endpoint_s3_id" {
  description = "The ID of VPC endpoint for S3"
  value       = try(aws_vpc_endpoint.s3[0].id, null)
}

output "vpc_endpoint_dynamodb_id" {
  description = "The ID of VPC endpoint for DynamoDB"
  value       = try(aws_vpc_endpoint.dynamodb[0].id, null)
}

output "vpc_endpoint_interface_ids" {
  description = "The IDs of the interface VPC endpoints"
  value       = aws_vpc_endpoint.interface_endpoints[*].id
}

# Availability Zones
output "azs" {
  description = "A list of availability zones specified as argument to this module"
  value       = var.azs
}

# CIDR blocks
output "vpc_cidr_block_associations" {
  description = "List of IPv4 CIDR block associations with the VPC"
  value       = aws_vpc.main.cidr_block
}

output "private_subnets_cidr_blocks" {
  description = "List of cidr_blocks of private subnets"
  value       = aws_subnet.private[*].cidr_block
}

output "public_subnets_cidr_blocks" {
  description = "List of cidr_blocks of public subnets"
  value       = aws_subnet.public[*].cidr_block
}

output "database_subnets_cidr_blocks" {
  description = "List of cidr_blocks of database subnets"
  value       = aws_subnet.database[*].cidr_block
}

output "elasticache_subnets_cidr_blocks" {
  description = "List of cidr_blocks of elasticache subnets"
  value       = aws_subnet.elasticache[*].cidr_block
}

# Security Groups
output "vpc_endpoints_security_group_id" {
  description = "The ID of the security group for VPC endpoints"
  value       = try(aws_security_group.vpc_endpoints[0].id, null)
}