import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { Role } from '@repo/database';
import { Permissions } from '../auth/decorators/permissions.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UpdateNameDto } from './dto/update-name.dto.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Permissions('user:read')
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Permissions('user:read')
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  @Permissions('user:update')
  @Roles(Role.USER)
  @Patch(':id/name')
  updateName(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateNameDto) {
    return this.usersService.updateName(id, dto.name);
  }
}
