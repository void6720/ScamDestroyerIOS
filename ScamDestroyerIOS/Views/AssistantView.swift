import SwiftUI
import FoundationModels

/// AI Assistant — on-device chat powered by Apple's Foundation Models
/// framework (iOS 26). The model runs entirely on the device: prompts and
/// replies never leave the phone, and nothing is sent to any server.
///
/// The assistant's job is scam triage: the user can paste a suspicious
/// text, email or pop-up message and get a plain-language read on it, or
/// ask general questions about staying safe. It cannot browse the web or
/// look anything up live — it judges the text it is given, and says so.
///
/// When Apple Intelligence is unavailable (device not eligible, not
/// enabled in Settings, or the model is still downloading), the tab shows
/// exactly why, plus static safety guidance, instead of a dead chat box.
struct AssistantView: View {
    @StateObject private var model = AssistantModel()
    @State private var draft = ""

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                statusPill
                if model.isAvailable {
                    messageList
                    if model.messages.isEmpty { quickPrompts }
                    inputBar
                } else {
                    unavailableCard
                }
            }
            .background(Color(red: 0.03, green: 0.04, blue: 0.07).ignoresSafeArea())
            .navigationTitle("Assistant")
            .toolbar {
                if model.isAvailable {
                    Button {
                        model.reset()
                    } label: {
                        Label("New chat", systemImage: "square.and.pencil")
                    }
                    .disabled(model.isResponding)
                }
            }
        }
    }

    // MARK: - Pieces

    private var statusPill: some View {
        HStack(spacing: 8) {
            Image(systemName: model.isAvailable ? "sparkles" : "exclamationmark.triangle.fill")
            Text(model.statusText)
                .font(.caption.weight(.medium))
                .lineLimit(2)
            Spacer()
            if model.isAvailable {
                Text("On-device")
                    .font(.caption2.weight(.bold))
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Color.green.opacity(0.25), in: Capsule())
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 9)
        .glassEffect(.regular, in: .rect(cornerRadius: 18))
        .padding(.horizontal, 12).padding(.top, 10).padding(.bottom, 6)
    }

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 10) {
                    if model.messages.isEmpty {
                        GlassCard {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Ask me about a suspicious message")
                                    .font(.headline)
                                Text("Paste a text, email or pop-up that worries you and I'll "
                                     + "walk through its warning signs. I run entirely on this "
                                     + "device — what you paste stays on the phone.")
                                    .font(.subheadline).foregroundStyle(.secondary)
                            }
                        }
                        .padding(.horizontal, 12).padding(.top, 4)
                    }
                    ForEach(model.messages) { message in
                        HStack {
                            if message.isUser { Spacer(minLength: 60) }
                            Text(message.text.isEmpty ? "…" : message.text)
                                .font(.body)
                                .padding(.horizontal, 14).padding(.vertical, 10)
                                .background(
                                    message.isUser
                                        ? Color.green.opacity(0.28)
                                        : Color.white.opacity(0.08),
                                    in: .rect(cornerRadius: 18)
                                )
                            if !message.isUser { Spacer(minLength: 60) }
                        }
                        .id(message.id)
                        .padding(.horizontal, 12)
                    }
                    if let error = model.lastError {
                        Text(error)
                            .font(.footnote).foregroundStyle(.red)
                            .padding(.horizontal, 16)
                    }
                }
                .padding(.vertical, 8)
            }
            .onChange(of: model.messages.last?.text) {
                if let last = model.messages.last {
                    withAnimation(.easeOut(duration: 0.2)) {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
            }
        }
    }

    private var quickPrompts: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(AssistantModel.quickPrompts, id: \.self) { prompt in
                Button {
                    model.send(prompt)
                } label: {
                    HStack {
                        Text(prompt).font(.subheadline).multilineTextAlignment(.leading)
                        Spacer()
                        Image(systemName: "arrow.up.right")
                    }
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 16))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12).padding(.bottom, 8)
    }

    private var inputBar: some View {
        HStack(alignment: .bottom, spacing: 8) {
            TextField("Message or paste something suspicious…", text: $draft, axis: .vertical)
                .lineLimit(1...5)
                .padding(.horizontal, 12).padding(.vertical, 9)
                .glassEffect(.regular, in: .rect(cornerRadius: 20))
            Button {
                let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !text.isEmpty else { return }
                draft = ""
                model.send(text)
            } label: {
                Image(systemName: model.isResponding ? "stop.circle.fill" : "arrow.up.circle.fill")
                    .font(.system(size: 32))
                    .foregroundStyle(model.isResponding ? .red : .green)
            }
            .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !model.isResponding)
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
    }

    private var unavailableCard: some View {
        ScrollView {
            GlassCard {
                VStack(alignment: .leading, spacing: 10) {
                    Text("On-device AI isn't ready on this device")
                        .font(.headline)
                    Text(model.statusText)
                        .font(.subheadline).foregroundStyle(.secondary)
                    Divider()
                    Text("Meanwhile, the three rules that stop most scams:")
                        .font(.subheadline.weight(.semibold))
                    Text("1. No real bank, courier or government office asks for codes, "
                         + "passwords or gift cards by text, email or pop-up.\n"
                         + "2. A link in an unexpected message is guilty until proven "
                         + "innocent — open the company's app or site yourself instead.\n"
                         + "3. Urgency is the weapon: \"act in 10 minutes\" almost always "
                         + "means it's a scam.")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
            }
            .padding(12)
            Spacer()
        }
    }
}

// MARK: - Chat state + Foundation Models session

struct ChatMessage: Identifiable, Equatable {
    let id = UUID()
    let isUser: Bool
    var text: String
}

@MainActor
final class AssistantModel: ObservableObject {
    @Published private(set) var messages: [ChatMessage] = []
    @Published private(set) var isResponding = false
    @Published private(set) var lastError: String?

    private var session: LanguageModelSession?

    static let quickPrompts = [
        "What are the signs of a phishing text?",
        "A text says my bank account is locked and gives a link. What should I do?",
        "How can I tell if a shopping website is fake?",
    ]

    private static let instructions = """
        You are the built-in assistant of ScamDestroyer, an anti-scam shield app. \
        Help the user judge suspicious texts, emails, calls and pop-ups, and explain \
        online-safety topics in plain, friendly language. Keep answers short — a few \
        sentences or a short list. When the user pastes a message, assess it: name the \
        warning signs you can see and say what to do next. You cannot browse the web or \
        verify links, senders or companies live — judge only the text you are given and \
        be honest about that limit. Never ask the user for passwords, one-time codes, \
        card numbers or other secrets, and warn them never to share those with anyone \
        who asks. Never tell the user a message is definitely safe; when signs point to \
        a scam, say so plainly and advise contacting the real company through its \
        official app or website, not through the message itself.
        """

    var availability: SystemLanguageModel.Availability {
        SystemLanguageModel.default.availability
    }

    var isAvailable: Bool {
        if case .available = availability { return true }
        return false
    }

    var statusText: String {
        switch availability {
        case .available:
            return "Apple Intelligence is ready. Chats stay on this device."
        case .unavailable(.deviceNotEligible):
            return "This device doesn't support Apple Intelligence, so the on-device assistant can't run here."
        case .unavailable(.appleIntelligenceNotEnabled):
            return "Apple Intelligence is turned off. Enable it in Settings → Apple Intelligence & Siri to use the assistant."
        case .unavailable(.modelNotReady):
            return "The on-device model is still downloading or preparing. Try again a little later."
        case .unavailable:
            return "The on-device model is unavailable right now."
        }
    }

    func reset() {
        messages = []
        lastError = nil
        session = nil
    }

    func send(_ text: String) {
        guard isAvailable, !isResponding else { return }
        lastError = nil
        messages.append(ChatMessage(isUser: true, text: text))
        let reply = ChatMessage(isUser: false, text: "")
        messages.append(reply)
        let replyID = reply.id
        isResponding = true

        if session == nil {
            session = LanguageModelSession(instructions: Self.instructions)
            session?.prewarm()
        }
        guard let session else { isResponding = false; return }

        Task {
            do {
                let stream = session.streamResponse(to: text)
                for try await partial in stream {
                    if let index = messages.firstIndex(where: { $0.id == replyID }) {
                        messages[index].text = partial.content
                    }
                }
            } catch let error as LanguageModelSession.GenerationError {
                handleGenerationError(error, replyID: replyID)
            } catch {
                setError("Something went wrong generating a reply. Try again.", replyID: replyID)
            }
            isResponding = false
        }
    }

    private func handleGenerationError(_ error: LanguageModelSession.GenerationError, replyID: UUID) {
        switch error {
        case .exceededContextWindowSize:
            // Start fresh: drop the session so the next send opens a new one.
            session = nil
            setError("This chat got too long for the on-device model. I've reset it — ask again in a new chat.", replyID: replyID)
        case .guardrailViolation:
            setError("I can't help with that one — it tripped the model's safety guardrails. Try rephrasing, or ask me about a suspicious message.", replyID: replyID)
        case .unsupportedLanguageOrLocale:
            setError("That language isn't supported by the on-device model yet.", replyID: replyID)
        case .rateLimited:
            setError("The model is busy right now. Give it a few seconds and try again.", replyID: replyID)
        case .concurrentRequests:
            setError("I'm still finishing the previous reply — one at a time.", replyID: replyID)
        default:
            setError("The on-device model couldn't answer that. Try again.", replyID: replyID)
        }
    }

    private func setError(_ text: String, replyID: UUID) {
        if let index = messages.firstIndex(where: { $0.id == replyID }), messages[index].text.isEmpty {
            messages.remove(at: index)
        }
        lastError = text
    }
}
