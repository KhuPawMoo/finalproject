import { Type } from "class-transformer";
import { IsArray, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from "class-validator";

export class MutationDto {
  @IsString()
  id!: string;

  @IsString()
  table!: string;

  @IsString()
  op!: string;

  @IsOptional()
  @IsObject()
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
  @ValidateNested({ each: true })
  @Type(() => MutationDto)
  mutations!: MutationDto[];
}
