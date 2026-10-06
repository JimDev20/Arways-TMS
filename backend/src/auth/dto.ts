import { IsEmail, IsIn, IsNotEmpty, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail() email!: string;
  @IsNotEmpty() password!: string;
}

export class RegisterDto {
  @IsEmail() email!: string;
  @MinLength(8) password!: string;
  @IsNotEmpty() fullName!: string;
  @IsIn(['Owner', 'Secretary', 'Client', 'Driver']) role!: string;
}
