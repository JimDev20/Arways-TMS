import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail() email!: string;
  @IsNotEmpty() password!: string;
}

export class RegisterDto {
  @IsEmail() email!: string;
  @MinLength(10, { message: 'Password must be 10–64 characters. Use a longer passphrase.' })
  @MaxLength(64, { message: 'Password must be 10–64 characters. Use a longer passphrase.' })
  password!: string;
  @IsNotEmpty() fullName!: string;
  @IsIn(['Owner', 'Secretary', 'Client', 'Driver']) role!: string;
  /** Contact number (all roles): digits, +, spaces, dashes, 7–20 chars. */
  @IsOptional()
  @Matches(/^[+\d][\d\s\-()]{6,19}$/, { message: 'Phone must be 7–20 characters: digits, spaces, +, -.' })
  phone?: string;
  /** Driver's license number (Driver role only, free text). */
  @IsOptional()
  @MaxLength(40, { message: 'License number is too long (max 40 characters).' })
  licenseNo?: string;
  /** Link a new Client login to an existing client company at creation. */
  @IsOptional()
  @IsUUID('4', { message: 'Client company is invalid. Pick it from the list.' })
  clientId?: string;
}
