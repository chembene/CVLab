import { PartialType } from '@nestjs/mapped-types';
import { CreateJobTargetDto } from './create-job-target.dto';

export class UpdateJobTargetDto extends PartialType(CreateJobTargetDto) {}
