import Fluent
import Vapor

struct MemberController: RouteCollection {
    func boot(routes: any RoutesBuilder) throws {
        let members = routes.grouped("members")
        members.get(use: index)
        members.post(use: create)
        members.get(":memberID", use: show)
        members.get(":memberID", "loans", use: getLoansFromUser)
        members.put(":memberID", use: edit)
        members.delete(":memberID", use: delete)
    }

    @Sendable
    func index(req: Request) async throws -> [MemberDTO] {
        try await Member.query(on: req.db).all().map { $0.toDTO() }
    }

    @Sendable
    func create(req: Request) async throws -> Response {
        try CreateMemberDTO.validate(content: req)
        let dto = try req.content.decode(CreateMemberDTO.self)

        let emailTaken = try await Member.query(on: req.db)
            .filter(\.$email == dto.email)
            .count() > 0
        guard !emailTaken else {
            throw Abort(.conflict, reason: "A member with this email already exists")
        }

        let member = dto.toModel()
        try await member.save(on: req.db)
        return try await member.toDTO().encodeResponse(status: .created, for: req)
    }

    @Sendable
    func show(req: Request) async throws -> MemberDTO {
        guard let memberID = req.parameters.get("memberID", as: UUID.self) else {
            throw Abort(.badRequest, reason: "Invalid member id")
        }
        guard let member = try await Member.find(memberID, on: req.db) else {
            throw Abort(.notFound, reason: "Member not found")
        }
        return member.toDTO()
    }

    @Sendable
    func edit(req: Request) async throws -> MemberDTO {

        guard let memberID = req.parameters.get("memberID", as: UUID.self) else {
            throw Abort(.badRequest, reason: "Invalid member id")
        }

        //get member from id
        guard var member = try await Member.query(on: req.db)
            .filter(\.$id == memberID)
            .with(\.$loans)
            .first()
        else {
            throw Abort(.notFound, reason: "Member not found")
        }


        //create updatedMemberDTO
        try UpdateMemberDTO.validate(content: req)
        let dto = try req.content.decode(UpdateMemberDTO.self)


        //ensure unique email
        let emailTaken = try await Member.query(on: req.db)
            .filter(\.$email == dto.email)
            .filter(\.$id != member.id!)
            .count() > 0
        guard !emailTaken else {
            throw Abort(.conflict, reason: "A member with this email already exists")
        }

        //apply data to existing game
        member = dto.apply(member: member)
        try await member.update(on: req.db)
        return member.toDTO()
    }

    @Sendable
    func delete(req: Request) async throws -> Response {
        guard let memberID = req.parameters.get("memberID", as: UUID.self) else {
            throw Abort(.badRequest, reason: "Invalid member id")
        }

        //get member from id
        guard let member = try await Member.query(on: req.db)
            .filter(\.$id == memberID)
            .with(\.$loans)
            .first()
        else {
            throw Abort(.notFound, reason: "Member not found")
        }

        if !member.loans.isEmpty {
            throw Abort(.conflict, reason: "A member with loans cannot be deleted")
        }

        try await member.delete(on: req.db)
        return Response(status: .noContent)
    }

    @Sendable
    func getLoansFromUser(req: Request) async throws -> [LoanWithGameDTO] {
        guard let memberID = req.parameters.get("memberID", as: UUID.self) else {
            throw Abort(.badRequest, reason: "Invalid member id")
        }
        
        guard let member = try await Member.find(memberID, on: req.db) else {
            throw Abort(.notFound, reason: "Member not found")
        }

        let loans = try await Loan
            .query(on: req.db)
            .filter(\.$member.$id == memberID)
            .with(\.$member)
            .with(\.$game)
            .all()


        return loans.map { $0.toLoanWithGameDTO() }
    }
}
