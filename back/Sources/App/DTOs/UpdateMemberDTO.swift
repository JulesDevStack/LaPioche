import Vapor

struct UpdateMemberDTO: Content, Validatable {
    let name: String
    let email: String

    static func validations(_ validations: inout Validations) {
        validations.add("name", as: String.self, is: !.empty)
        validations.add("email", as: String.self, is: .email)
    }

    func apply(member: Member) -> Member {
        member.name = name
        member.email = email
        
        return member
    }
}
