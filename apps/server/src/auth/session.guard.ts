import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request as ExpressRequest } from "express";
import { fromNodeHeaders } from "better-auth/node";

import { AuthHandle } from "./auth.server";

export const IS_PUBLIC_KEY = "resume-god:isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export interface SessionUser {
  id: string;
  email: string;
  display_name: string;
}

export type RequestWithUser = ExpressRequest & { user?: SessionUser };

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly auth: AuthHandle,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const session = await this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session) {
      throw new UnauthorizedException("Login required");
    }
    request.user = {
      id: session.user.id,
      email: session.user.email,
      display_name: session.user.name,
    };
    return true;
  }
}
