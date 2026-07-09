import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ViewingMode, ViewingRequestStatus } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { CreateDealThreadDto, CreateViewingRequestDto, SendDealMessageDto, ViewingModeDtoValue } from "./dto";

const threadInclude = {
  messages: {
    orderBy: {
      createdAt: "asc" as const
    }
  },
  viewingRequests: {
    orderBy: {
      createdAt: "asc" as const
    }
  }
};

@Injectable()
export class DealThreadsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findForUser(ownerId: string) {
    const threads = await this.prisma.dealThread.findMany({
      where: {
        ownerId
      },
      include: threadInclude,
      orderBy: {
        updatedAt: "desc"
      }
    });

    return threads.map((thread) => this.toThreadResponse(thread));
  }

  async createOrFindThread(ownerId: string, dto: CreateDealThreadDto) {
    const participantNames = uniqueNames(dto.participantNames ?? []);
    const dealRoomId = await this.resolveOwnedDealRoomId(ownerId, dto.dealRoomId);

    const thread = await this.prisma.dealThread.upsert({
      where: {
        ownerId_listingId: {
          ownerId,
          listingId: dto.listingId.trim()
        }
      },
      create: {
        ownerId,
        dealRoomId,
        listingId: dto.listingId.trim(),
        listingTitle: dto.listingTitle.trim(),
        area: dto.area.trim(),
        contactName: dto.contactName.trim(),
        participantNames
      },
      update: {
        dealRoomId,
        listingTitle: dto.listingTitle.trim(),
        area: dto.area.trim(),
        contactName: dto.contactName.trim(),
        participantNames
      },
      include: threadInclude
    });

    return this.toThreadResponse(thread);
  }

  async sendMessage(ownerId: string, threadId: string, dto: SendDealMessageDto) {
    const thread = await this.requireOwnedThread(ownerId, threadId);
    const body = dto.body.trim();
    if (!body) throw new BadRequestException("Message body is required");

    await this.prisma.dealMessage.create({
      data: {
        threadId: thread.id,
        senderId: ownerId,
        senderName: "You",
        body,
        align: "right",
        status: "sent"
      }
    });

    return this.requireOwnedThread(ownerId, threadId);
  }

  async createViewingRequest(ownerId: string, threadId: string, dto: CreateViewingRequestDto) {
    const thread = await this.requireOwnedThread(ownerId, threadId);
    const participantNames = uniqueNames(dto.participantNames);
    if (participantNames.length === 0) throw new BadRequestException("At least one viewing participant is required");

    const mode = toPrismaViewingMode(dto.mode);
    const timeLabel = dto.timeLabel.trim();
    const viewingModeLabel = dto.mode === "video" ? "视频" : "线下";
    const viewingData = {
      requesterId: ownerId,
      listingId: thread.listingId,
      listingTitle: thread.listingTitle,
      area: thread.area,
      timeLabel,
      iso: new Date(dto.iso),
      mode,
      participantNames,
      status: ViewingRequestStatus.REQUESTED
    };
    const existingActiveRequest = await this.prisma.viewingRequest.findFirst({
      where: {
        threadId: thread.id,
        status: {
          in: ["REQUESTED", "CONFIRMED"]
        }
      },
      orderBy: {
        updatedAt: "desc"
      }
    });

    if (existingActiveRequest) {
      await this.prisma.viewingRequest.update({
        where: {
          id: existingActiveRequest.id
        },
        data: viewingData
      });
    } else {
      await this.prisma.viewingRequest.create({
        data: {
          threadId: thread.id,
          ...viewingData
        }
      });
    }

    const actionLabel = existingActiveRequest ? "调整看房到" : "预约";
    await this.prisma.dealMessage.create({
      data: {
        threadId: thread.id,
        senderId: ownerId,
        senderName: "You",
        body: `我想${actionLabel} ${timeLabel} 的${viewingModeLabel}看房，参与人：${participantNames.join(", ")}。`,
        align: "right",
        status: "sent"
      }
    });

    return this.requireOwnedThread(ownerId, threadId);
  }

  private async resolveOwnedDealRoomId(ownerId: string, dealRoomId: string | undefined) {
    const cleanedDealRoomId = cleanOptional(dealRoomId);
    if (!cleanedDealRoomId) return undefined;

    const dealRoom = await this.prisma.dealRoom.findFirst({
      where: {
        id: cleanedDealRoomId,
        ownerId,
        status: "ACTIVE"
      }
    });
    if (!dealRoom) throw new NotFoundException("Deal room not found");

    return cleanedDealRoomId;
  }

  private async requireOwnedThread(ownerId: string, threadId: string) {
    const thread = await this.prisma.dealThread.findFirst({
      where: {
        id: threadId,
        ownerId
      },
      include: threadInclude
    });
    if (!thread) throw new NotFoundException("Deal thread not found");

    return this.toThreadResponse(thread);
  }

  private toThreadResponse(thread: any) {
    return {
      ...thread,
      viewingRequests: (thread.viewingRequests ?? []).map((request: any) => ({
        ...request,
        mode: request.mode === "VIDEO" ? "video" : "in-person"
      }))
    };
  }
}

function uniqueNames(names: string[]) {
  return Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
}

function cleanOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function toPrismaViewingMode(value: ViewingModeDtoValue) {
  return value === "video" ? ViewingMode.VIDEO : ViewingMode.IN_PERSON;
}
