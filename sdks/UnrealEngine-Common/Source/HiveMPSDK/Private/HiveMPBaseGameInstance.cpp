// Copyright Redpoint Games 2017 MIT Licensed

#include "HiveMPBaseGameInstance.h"
#include "OnlineSubsystem.h"
#include "Engine.h"
#include "cchost/connect.impl.h"
#include "cchost/module/hotpatching/module.h"
#include <cstdint>

void UHiveMPBaseGameInstance::Init()
{
	// Initialise HiveMP Client Connect.
	cci_init(true, nullptr);

	// Register the ticker for HiveMP Client Connect.
	this->TickDelegateHandle = FTicker::GetCoreTicker().AddTicker(FTickerDelegate::CreateUObject(this, &UHiveMPBaseGameInstance::TickClientConnect));

	// Call the parent Init.
	Super::Init();
}

void UHiveMPBaseGameInstance::Shutdown()
{
	// Deregister the ticker for HiveMP Client Connect.
	FTicker::GetCoreTicker().RemoveTicker(TickDelegateHandle);

	// Call the parent Shutdown.
	Super::Shutdown();
}

bool UHiveMPBaseGameInstance::TickClientConnect(float DeltaSeconds)
{
	// Update HiveMP Client Connect, processing coroutines, etc.
	cci_tick();

	// Call any callbacks for completed HiveMP Client Connect handles.
	for (auto& Elem : this->RegisteredCallbackHandles)
	{
		if (js_is_api_hotpatch_call_ready(Elem.Key))
		{
			FString Result = FString(js_get_api_hotpatch_result(Elem.Key));
			int32_t StatusCode = js_get_api_hotpatch_status_code(Elem.Key);
			Elem.Value->Execute(StatusCode, Result);
			js_release_api_hotpatch_result(Elem.Key);
		}
	}

	return true;
}

FSocket* UHiveMPBaseGameInstance::GetSharedSocketForNetworking()
{
	if (this->SocketForNetworking != nullptr)
	{
		return this->SocketForNetworking;
	}

	ISocketSubsystem* SocketSubsystem = ISocketSubsystem::Get();

	if (SocketSubsystem == NULL)
	{
		UE_LOG(LogOnline, Warning, TEXT("UHiveMPBaseGameInstance::GetSocketForNetworking: Unable to find socket subsystem"));
		return nullptr;
	}

	this->SocketForNetworking = SocketSubsystem->CreateSocket(NAME_DGram, TEXT("Unreal"));
	if (GEngine)
	{
		GEngine->AddOnScreenDebugMessage(-1, 30.0f, FColor::Green, TEXT("Created shared networking socket for NAT punchthrough + gameplay"));
	}
	return this->SocketForNetworking;
}

bool UHiveMPBaseGameInstance::CanTakeSocketForNetworking()
{
	return !this->SocketForNetworkingHasExclusiveNetDriverOwner;
}

FSocket* UHiveMPBaseGameInstance::TakeSocketForNetworking()
{
	if (this->SocketForNetworkingHasExclusiveNetDriverOwner)
	{
		return nullptr;
	}

	this->SocketForNetworkingHasExclusiveNetDriverOwner = true;
	auto Socket = this->GetSharedSocketForNetworking();
	if (GEngine)
	{
		GEngine->AddOnScreenDebugMessage(-1, 30.0f, FColor::Yellow, TEXT("Shared networking socket now reserved by gameplay"));
	}
	return Socket;
}

void UHiveMPBaseGameInstance::ReleaseSocketForNetworking()
{
	if (!this->SocketForNetworkingHasExclusiveNetDriverOwner)
	{
		return;
	}

	ISocketSubsystem* SocketSubsystem = ISocketSubsystem::Get();

	if (SocketSubsystem == NULL)
	{
		UE_LOG(LogOnline, Warning, TEXT("UHiveMPBaseGameInstance::CleanupSocketForNetworking: Unable to find socket subsystem"));
		return;
	}

	if (this->SocketForNetworking != nullptr)
	{
		if (!this->SocketForNetworking->Close())
		{
			UE_LOG(LogExit, Log, TEXT("closesocket error (%i)"), (int32)SocketSubsystem->GetLastErrorCode());
		}

		if (GEngine)
		{
			GEngine->AddOnScreenDebugMessage(-1, 30.0f, FColor::Red, TEXT("Releasing / destroying shared networking socket"));
		}

		SocketSubsystem->DestroySocket(this->SocketForNetworking);
		this->SocketForNetworking = nullptr;
	}
}
