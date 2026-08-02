import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateApplicationDto } from './create-application.dto';

// jobTargetId is intentionally excluded: an application binds permanently
// to the job target it was created for — "moving" it to a different target
// isn't a supported operation (create a new application instead).
export class UpdateApplicationDto extends PartialType(
  OmitType(CreateApplicationDto, ['jobTargetId'] as const),
) {}
