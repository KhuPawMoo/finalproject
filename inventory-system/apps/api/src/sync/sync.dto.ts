import { IsArray, IsNumber, IsOptional, IsString } from "class-validator";
import { Type } from "class-transformer";

export class MutationDto {
  @IsString()
  id!: string;

  @IsString()
  table!: string;

  @IsString()
  op!: string;

  @IsOptional()
  row?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  updatedAt?: number;
}

export class SyncRequestDto {
  @IsString()
  clientId!: string;

  @IsOptional()
  @IsString()
  lastSyncAt?: string;

  @IsArray()
  @Type(() => MutationDto)
  mutations!: MutationDto[];
}
