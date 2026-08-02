import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

/** Shared by every section controller's PUT :section/reorder — one identical shape for all 11. */
export class ReorderSectionsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  orderedIds!: string[];
}
