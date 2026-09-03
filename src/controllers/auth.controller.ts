import { Request, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { loginUser, getCurrentUser, registerUser } from "../services/auth.service";
import { sendMail } from "../mailer/mailer";
import { hashPassword, verifyPassword } from "../utils/password";
import { AuthTokenPayload, UserRole } from "../types";
import { signToken } from "../utils/jwt";


// Controllers only handle HTTP concerns (read the request, call the
// service, shape the response) — all business logic lives in
// ../services/auth.service.ts.

export const register = asyncHandler(async (req:Request, res: Response) => {
   try {
    const user = req.body
    const password = user.passwordHash;
    const hashedPassword = await hashPassword(password)
    user.passwordHash = hashedPassword;

    // generate a 6 digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString()
    user.verificationCode = verificationCode;
    user.isVerified = false;


    const createUser = await registerUser(user)
    if (!createUser) {
      return res.status(400).json({message: "User not created!"})
    }
    try {
      await sendMail(
        user.email,
        "verify your account",
        `Hello ${user.lastName}, your verification code is: ${verificationCode}`,
        `<div>
        <h2>Hello ${user.lastName} </h2>  
        <p>Your verificaton code is: <strong> ${verificationCode} </strong> </p>
        <p> Enter this code to verify your account </p>
        </div>`
      )
    } catch (emailError) {
      console.error("Failed to send registration email:", emailError)
    }

    return res.status(201).json({message: "User created and verification sent to your email"})

  } catch (error: any) {
    return res.status(500).json({error: error.message})
  }
})

export const login = asyncHandler(async (req: Request, res: Response) => {
  try {
   const user = req.body ?? {};
   const email = user.email
   const password = user.passwordHash

    const result = await loginUser(email, password);
    if (!result) {
      return res.status(404).json({message: "The user does not exist"})
    }

    //verify the password with the hash 
    const userMatch = await verifyPassword(password, result.user.passwordHash)
    if (!userMatch) {
      return res.status(401).json({message: "Invalid credentials"})
    };
    
    return res.status(200).json({
      signToken,
      user: {
        "user_id": result.user.id,
        "name": result.user.name,
        "email": result.user.email,
        "role": result.user.role
      }
    })
    
  } catch (error: any) {
    return res.status(500).json({error: error.message})
  }
  
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await getCurrentUser(req.user!.sub);
  res.status(200).json(user);
});
