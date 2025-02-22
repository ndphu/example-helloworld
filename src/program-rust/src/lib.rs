use arrayref::array_mut_ref;
use num_derive::FromPrimitive;
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    decode_error::DecodeError,
    pubkey::Pubkey,
};
use std::mem::size_of;
use thiserror::Error;
use std::str::from_utf8;


#[derive(Clone, Debug, Eq, Error, FromPrimitive, PartialEq)]
pub enum MessageFeedError {
    #[error("User is banned")]
    BannedUser,
    #[error("Next message already exists")]
    NextMessageExists,
    #[error("Creator mismatch")]
    CreatorMismatch,
}
impl From<MessageFeedError> for ProgramError {
    fn from(e: MessageFeedError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
impl<T> DecodeError<T> for MessageFeedError {
    fn type_of() -> &'static str {
        "MessageFeedError"
    }
}

type PubkeyData = [u8; 32];

struct UserAccountData<'a> {
    pub banned: &'a mut bool,
    pub creator: &'a mut PubkeyData,
}
impl<'a> UserAccountData<'a> {
    fn new(data: &'a mut [u8]) -> Self {
        let (banned, creator) = data.split_at_mut(1);
        Self {
            banned: unsafe { &mut *(&mut banned[0] as *mut u8 as *mut bool) },
            creator: array_mut_ref!(creator, 0, size_of::<PubkeyData>()),
        }
    }
}

struct MessageAccountData<'a> {
    pub next_message: &'a mut PubkeyData,
    pub from: &'a mut PubkeyData,
    pub creator: &'a mut PubkeyData,
    pub text: &'a mut [u8],
}
impl<'a> MessageAccountData<'a> {
    fn new(data: &'a mut [u8]) -> Self {
        let (next_message, rest) = data.split_at_mut(size_of::<PubkeyData>());
        let (from, rest) = rest.split_at_mut(size_of::<PubkeyData>());
        let (creator, text) = rest.split_at_mut(size_of::<PubkeyData>());
        Self {
            next_message: array_mut_ref!(next_message, 0, size_of::<PubkeyData>()),
            from: array_mut_ref!(from, 0, size_of::<PubkeyData>()),
            creator: array_mut_ref!(creator, 0, size_of::<PubkeyData>()),
            text,
        }
    }
}


// Declare and export the program's entrypoint
entrypoint!(process_instruction);

// Program entrypoint's implementation
fn process_instruction(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    input: &[u8],
) -> ProgramResult {
    msg!("Helloworld Rust program entrypoint");

    msg!("Size of accounts {}", accounts.len());

    let account_info_iter = &mut accounts.iter();

    msg!("Debug 1");

    let user_account = next_account_info(account_info_iter)?;
    let mut user_data = user_account.data.borrow_mut();
    let user_data = UserAccountData::new(&mut user_data);
    
    msg!("Debug 2");

    let message_account = next_account_info(account_info_iter)?;
    let mut new_message_data = message_account.data.borrow_mut();
    let new_message_data = MessageAccountData::new(&mut new_message_data);

    msg!("Debug 3");

    if !user_account.is_signer {
        msg!("Error: not signed by key 0");
        return Err(ProgramError::MissingRequiredSignature);
    }

    msg!("Debug 4");

    if !message_account.is_signer {
        msg!("Error: not signed by key 1");
        return Err(ProgramError::MissingRequiredSignature);
    }

    msg!("Debug 5");

    if input.is_empty() {
        msg!("Creating user...");
        user_data
            .creator
            .clone_from_slice(message_account.key.as_ref());
    } else {
        msg!("Writing message...");
        // Write the message text into new_message_data
        new_message_data.text.clone_from_slice(input);

        // Save the pubkey of who posted the message
        msg!("Save public key of who posted the message");
        new_message_data
            .from
            .clone_from_slice(user_account.key.as_ref());

        if let Ok(existing_message_account) = next_account_info(account_info_iter) {
            let mut existing_message_data = existing_message_account.data.borrow_mut();
            let existing_message_data = MessageAccountData::new(&mut existing_message_data);

            if existing_message_data.next_message != &[0; size_of::<PubkeyData>()] {
                msg!("Error: account 1 already has a next_message");
                return Err(MessageFeedError::NextMessageExists.into());
            }

            // Link the new_message to the existing_message
            msg!("Link the new_message to the existing_message...");
            existing_message_data
                .next_message
                .clone_from_slice(message_account.key.as_ref());

            // Check if a user should be banned
            msg!("Check if a user should be banned...");
            if let Ok(ban_user_account) = next_account_info(account_info_iter) {
                let mut ban_user_data = ban_user_account.data.borrow_mut();
                let ban_user_data = UserAccountData::new(&mut ban_user_data);
                *ban_user_data.banned = true;
            }

            // Propagate the chain creator to the new message
            msg!("Propagate the chain creator to the new message...");
            new_message_data
                .creator
                .clone_from_slice(existing_message_data.creator.as_ref());
        } else {
            // This is the first message in the chain, it is the "creator"
            msg!("This is the first message in the chain, it is the 'creator'");
            new_message_data
                .creator
                .clone_from_slice(message_account.key.as_ref());
        }

        if user_data.creator != new_message_data.creator {
            msg!("user_data/new_message_data creator mismatch");
            return Err(MessageFeedError::CreatorMismatch.into());
        }
    }

    msg!("Debug 6");

    let mesg = from_utf8(input).map_err(|err| {
        msg!("Invalid UTF-8, from byte {}", err.valid_up_to());
        ProgramError::InvalidInstructionData
    })?;
    msg!("Received message (len {}): {:?}", mesg.len(), mesg);

    msg!("Success");

    Ok(())
}